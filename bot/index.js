// antam-bot-war/bot/index.js (VERSI FINAL - PARALEL DENGAN PILIHAN BUTIK & RETRY)

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const yargs = require("yargs/yargs");
const csv = require("csv-parser");
const { hideBin } = require("yargs/helpers");
const prompt = require("prompt-sync")({ sigint: true });
const logger = require("./logger");
const Table = require("cli-table3");

// --- KONFIGURASI API & DATA TEMPLATE ---
const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;
const LIST_REGISTRATIONS_ENDPOINT = `${LARAVEL_API_URL}/bot/list-registrations`;

// Data butik default (dipakai saat bot start)
let currentAntamURL = "http://antrigrahadipta.com/"; // Default URL

// --- DATA DUMMY TEMPLATE ---
const USER_DATA_TEMPLATE = {
  name: "Anto Santoso",
  nik: "3175030203870007",
  phone_number: "085695810460",
  branch: "BUTIK EMAS GRAHA CIPTA",
  branch_selector: "GRAHA CIPTA",
  purchase_date: "2025-10-30",
};

const MAX_RETRIES = 5;

puppeteer.use(StealthPlugin());

// --- UTILITY FUNGSI ---
const randomDelay = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

// --- FUNGSI INTI OTOMASI FORM ---
async function handleFormFilling(page, data) {
  logger.info("[FORM] Starting form automation...");

  // 1. SCROLL ALAMI
  logger.info("[BEHAVIOUR] Simulating initial scroll...");
  await page.evaluate(() => {
    window.scrollBy(0, 500 + Math.floor(Math.random() * 200));
  });
  await randomDelay(1000, 2000);

  // 2. MENGISI INPUT UTAMA
  logger.info(`[INPUT] Typing Name: ${data.name}`);
  await page.type("#name", data.name, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing NIK: ${data.nik}`);
  await page.type("#ktp", data.nik, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing Phone: ${data.phone_number}`);
  await page.type("#phone_number", data.phone_number, {
    delay: randomDelay(50, 150),
  });
  await randomDelay(300, 700);

  // 3. MENGKLIK CHECKBOX PERSETUJUAN
  logger.info("[INPUT] Clicking KTP agreement checkbox (#check)...");
  await page.click("#check");
  await randomDelay(500, 800);

  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox (#check_2)...");
  await page.click("#check_2");
  await randomDelay(500, 1000);

  // 4. MEMBACA DAN MENGISI CAPTCHA TEKS
  logger.info("[CAPTCHA] Reading static Captcha text...");
  const captchaText = await page.$eval("#captcha-box", (el) =>
    el.textContent.trim()
  );
  logger.info(`[CAPTCHA] Text found: ${captchaText}`);

  logger.info("[CAPTCHA] Typing Captcha answer...");
  await page.type("#captcha_input", captchaText, {
    delay: randomDelay(100, 250),
  });
  await randomDelay(1000, 2000);

  // 5. SUBMIT FORM
  logger.info("[FORM] Clicking submit button...");
  await page.click('button[type="submit"]');
  await randomDelay(2000, 3000);

  // 6. DETEKSI HASIL
  const successIndicatorSelector = 'h4:has-text("Nomor Antrian Anda")';

  const successIndicator = await page.evaluate((selector) => {
    const elements = Array.from(document.querySelectorAll("h4"));
    const successEl = elements.find((el) =>
      el.textContent.includes("Nomor Antrian Anda")
    );
    return successEl ? successEl.textContent : null;
  }, successIndicatorSelector);

  if (successIndicator) {
    return {
      status: "SUCCESS",
      ticket_number: successIndicator.trim(),
    };
  } else {
    // Cek pesan error validasi
    const errorCheck1 = await page.evaluate(
      () =>
        document.querySelector("#error-check") &&
        !document.querySelector("#error-check").classList.contains("d-none")
    );
    const errorCheck2 = await page.evaluate(
      () =>
        document.querySelector("#error-check2") &&
        !document.querySelector("#error-check2").classList.contains("d-none")
    );

    if (errorCheck1 || errorCheck2) {
      logger.error(
        "[RESULT] FAILED: Checkbox error shown or Captcha/NIK/Phone is wrong."
      );
      return { status: "FAILED_VALIDATION", ticket_number: null };
    }

    logger.error(
      "[RESULT] FAILED: No success indicator found. Probably server overload/error or form not submitted."
    );
    return { status: "FAILED_UNKNOWN", ticket_number: null };
  }
}

// --- FUNGSI API KE LARAVEL ---
async function sendRegistrationResult(data) {
  try {
    const response = await axios.post(SAVE_RESULT_ENDPOINT, data);
    logger.info(
      "[SUCCESS] Result sent to Laravel. ID:",
      response.data.registration_id
    );
  } catch (error) {
    logger.error(
      "[FATAL] Failed to send result to Laravel. Check DB/Validation."
    );

    if (error.response) {
      logger.error(`Status API: ${error.response.status}`);
      if (error.response.data && error.response.data.errors) {
        logger.error(
          "Validation Errors:",
          JSON.stringify(error.response.data.errors, null, 2)
        );
      } else {
        logger.error(
          "API Error Response:",
          JSON.stringify(error.response.data, null, 2)
        );
      }
    } else {
      logger.error(`Error details: ${error.message}`);
    }
  }
}

// --- FUNGSI UTAMA BOT ENGINE PER NIK (DENGAN URL DINAMIS & RETRY LOOP) ---
async function runAntamWar(userData, antamURL) {
  let browser;
  const now = new Date();
  const localWarTime = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta", // Secara eksplisit set ke WIB
  })
    .format(now)
    .replace(/-/g, "-")
    .replace(" ", " ");

  // --- 2. DEKLARASI REGISTRATION RESULT ---
  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: localWarTime, // <--- GUNAKAN VARIABEL YANG SUDAH DIDEKLARASI
  };

  const launchOptions = {
    headless: true, // Ganti ke false untuk debugging
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
    defaultViewport: null,
  };

  logger.info(`[JOB] Starting job for NIK: ${userData.nik}`);
  let success = false;
  let attempt = 0;

  // LOOP PERCOBAAN ULANG
  while (attempt < MAX_RETRIES && !success) {
    attempt++;
    logger.warn(
      `[RETRY] Attempt ${attempt}/${MAX_RETRIES} for NIK: ${userData.nik}`
    );

    try {
      // NOTE: Di mode paralel, kita tidak menutup browser di sini.
      // Kita buka browser baru untuk setiap NIK/Job.
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      // 1. GOTO URL menggunakan URL yang dipilih
      logger.info(`[RETRY] Navigating to ${antamURL}...`);
      await page.goto(antamURL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // 2. TUNGGU FORM MUNCUL
      logger.info("[RETRY] Waiting for form selector '#name'...");
      await page.waitForSelector("#name", { timeout: 20000 });

      logger.info("[RETRY] Form loaded. Starting filling process...");

      const resultFromForm = await handleFormFilling(page, userData);
      const finalPageContent = await page.content();

      registrationResult = {
        ...registrationResult,
        ...resultFromForm,
        raw_response: {
          success_page_content: finalPageContent.substring(0, 500),
        },
      };

      success = true; // Keluar dari loop karena berhasil
    } catch (error) {
      logger.error(
        `[ATTEMPT ${attempt}] Failed to load form or complete filling for NIK ${userData.nik}: ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        logger.error(
          `[CRITICAL ERROR] Max retries reached for NIK ${userData.nik}. Stopping.`
        );
        registrationResult.status = "FAILED";
        registrationResult.raw_response = {
          error: `Max retries reached: ${error.message}`,
        };
      } else {
        logger.info("[RETRY] Waiting 3-5 seconds before next attempt...");
        await randomDelay(3000, 5000);
      }
    } finally {
      // Menutup browser hanya setelah selesai (sukses atau gagal total)
      if (success || attempt === MAX_RETRIES) {
        if (browser) {
          if (launchOptions.headless) {
            await browser.close();
            logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
          } else {
            logger.info(
              `[JOB] Browser kept open for debug for NIK: ${userData.nik}`
            );
            // JANGAN DITUTUP OTOMATIS DI PARALEL, agar Anda bisa melihat hasilnya.
            // Kita akan biarkan browser tetap terbuka. Hapus penutupan otomatis di sini.
            // Biarkan user menutup manual saat debugging mode.
            // Jika mode headless: true, browser sudah ditutup

            // Hapus blok await randomDelay dan await browser.close() jika headless: false
            if (launchOptions.headless === false && success) {
              logger.warn(
                `[DEBUG] Browser untuk NIK ${userData.nik} tetap terbuka. Tutup manual.`
              );
            } else {
              await browser.close();
              logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
            }
          }
        }
      }
    }
  }

  await sendRegistrationResult({ ...userData, ...registrationResult });
  logger.info(`[JOB] Finished job for NIK: ${userData.nik}`);
  // Mengembalikan hasil untuk Promise.all
  return registrationResult;
}

// --- FUNGSI PEMBANTU UNTUK MENJALANKAN JOB SECARA PARALEL ---
async function runAllJobsInParallel(userList) {
  logger.info(`[PARALLEL] Starting ${userList.length} jobs concurrently...`);

  const tasks = userList.map((userData) => {
    // Run runAntamWar tanpa await.
    // runAntamWar akan mengurus browser dan retry-nya sendiri.
    return runAntamWar(userData, currentAntamURL).catch((e) => {
      logger.error(
        `[FATAL PARALLEL] Job for NIK ${userData.nik} failed unexpectedly: ${e.message}`
      );
      return { status: "FAILED_CRITICAL", nik: userData.nik };
    });
  });

  // Promise.all menunggu semua promise (job) selesai
  await Promise.all(tasks);

  logger.info("[PARALLEL] All concurrent jobs completed.");
}

// --- FUNGSI INPUT MANUAL DENGAN VALIDASI ---
async function processManualInput() {
  logger.info("\n--- MODE INPUT MANUAL ---");

  const name = prompt("Masukkan Nama: ");

  let nik;
  do {
    nik = prompt("Masukkan NIK (16 digit): ");
    if (nik.trim().length !== 16 || isNaN(nik.trim())) {
      logger.error(
        "[VALIDASI] NIK harus tepat 16 digit dan berupa angka. Coba lagi."
      );
    }
  } while (nik.trim().length !== 16 || isNaN(nik.trim()));

  let phone_number;
  do {
    phone_number = prompt("Masukkan No. HP (diawali 08xx): ");
    if (!phone_number.trim().startsWith("08") || isNaN(phone_number.trim())) {
      logger.error(
        "[VALIDASI] Nomor HP harus diawali '08' dan berupa angka. Coba lagi."
      );
    }
  } while (!phone_number.trim().startsWith("08") || isNaN(phone_number.trim()));

  const branch = prompt("Masukkan Nama Cabang (ex: BUTIK EMAS GRAHA CIPTA): ");
  const branch_selector = prompt(
    "Masukkan Selector Cabang (ex: GRAHA CIPTA): "
  );

  const purchase_date =
    prompt("Masukkan Tanggal Pembelian (YYYY-MM-DD, default 2025-11-01): ") ||
    "2025-11-01";

  const userData = {
    ...USER_DATA_TEMPLATE,
    name,
    nik: nik.trim(),
    phone_number: phone_number.trim(),
    branch,
    branch_selector,
    purchase_date,
  };

  logger.info(`[MANUAL] Starting single job for NIK: ${userData.nik}`);
  await runAntamWar(userData, currentAntamURL);
}

// --- FUNGSI PROSES UTAMA (Multi-NIK JSON - PARALEL) ---
async function processUserData(dataFilePath) {
  logger.info(`[CLI] Reading user data from: ${dataFilePath}`);

  let rawData;
  try {
    rawData = fs.readFileSync(dataFilePath);
  } catch (e) {
    logger.error(`[FATAL] Could not read data file: ${e.message}`);
    return;
  }

  let userListRaw;
  try {
    userListRaw = JSON.parse(rawData);
  } catch (e) {
    logger.error(`[FATAL] Failed to parse JSON data: ${e.message}`);
    return;
  }

  if (!Array.isArray(userListRaw) || userListRaw.length === 0) {
    logger.error("[FATAL] Data file must contain a non-empty array of users.");
    return;
  }

  // Mapping dan penyiapan data sebelum dilempar ke paralel
  const userList = userListRaw.map((userEntry) => ({
    ...USER_DATA_TEMPLATE,
    name: userEntry.nama || userEntry.name,
    nik: userEntry.nik,
    phone_number: userEntry.telepon || userEntry.phone_number,
  }));

  // Panggil fungsi paralel
  await runAllJobsInParallel(userList);

  logger.info("[CLI] All JSON user jobs completed.");
}

// --- FUNGSI PROSES INPUT CSV (PARALEL) ---
async function processCSVData(dataFilePath) {
  logger.info(`[CLI] Reading user data from CSV: ${dataFilePath}`);

  const userList = await new Promise((resolve, reject) => {
    const results = [];

    if (!fs.existsSync(dataFilePath)) {
      logger.error(`[FATAL] File not found: ${dataFilePath}`);
      return resolve([]);
    }

    fs.createReadStream(dataFilePath)
      .pipe(csv())
      .on("data", (data) => {
        const userData = {
          ...USER_DATA_TEMPLATE,
          ...data,
        };
        results.push(userData);
      })
      .on("end", () => {
        logger.info(
          `[CLI] Successfully parsed ${results.length} records from CSV.`
        );
        resolve(results);
      })
      .on("error", (err) => {
        logger.error(`[FATAL] Error reading CSV file: ${err.message}`);
        reject(err);
      });
  });

  if (!Array.isArray(userList) || userList.length === 0) {
    logger.error("[FATAL] CSV file is empty or could not be processed.");
    return;
  }

  // Panggil fungsi paralel
  await runAllJobsInParallel(userList);

  logger.info("[CLI] All CSV user jobs completed.");
}

// --- FUNGSI MENAMPILKAN STATUS PENDAFTARAN ---
async function displayStatus() {
  logger.info("\n--- STATUS PENDAFTARAN ---");

  try {
    const response = await axios.get(LIST_REGISTRATIONS_ENDPOINT);
    const data = response.data.data;

    if (data.length === 0) {
      logger.info("Database pendaftaran masih kosong.");
      return;
    }

    const table = new Table({
      head: ["Waktu Daftar", "NIK", "Nama", "Cabang", "Status", "No. Tiket"],
      colWidths: [20, 18, 15, 18, 10, 12],
    });

    data.forEach((item) => {
      const statusText = item.status === "SUCCESS" ? "BERHASIL ✅" : "GAGAL ❌";
      const ticketText = item.ticket_number || "-";

      table.push([
        item.created_at.substring(5, 16).replace("T", " "),
        item.nik,
        item.name.substring(0, 14),
        item.branch.substring(13, item.branch.length),
        statusText,
        ticketText,
      ]);
    });

    console.log(table.toString());
  } catch (error) {
    logger.error(
      "[FATAL] Gagal mengambil data dari Laravel API. Pastikan 'php artisan serve' berjalan."
    );
    if (error.response) {
      logger.error(`Status API: ${error.response.status}`);
    } else {
      logger.error(`Error details: ${error.message}`);
    }
  }
}

// antam-bot-war/bot/index.js (di sekitar baris FUNGSI SET URL BUTIK)

// --- FUNGSI SET URL BUTIK ---
function setAntamURL() {
    logger.info("\n--- PILIH BUTIK ANTAM ---");
    const butikOptions = [
        "https://antrigrahadipta.com/",
        "https://antributikserpong.com/",
        "https://antributikbintaro.com/",
        `file://${MOCKUP_FILE}`, // Opsi Baru: Mockup File Lokal
        "Custom URL",
    ];

    butikOptions.forEach((url, index) => {
        // Tampilkan nama yang lebih mudah dibaca untuk mockup
        const displayUrl = url.startsWith('file://') ? 'MOCKUP FILE (Local HTML)' : url;
        console.log(`${index + 1}. ${displayUrl}`);
    });
    
    console.log(`\nURL Aktif Saat Ini: ${currentAntamURL}`);
    
    const choice = prompt("Pilih nomor butik atau masukkan URL baru: ");
    const numChoice = parseInt(choice.trim());

    if (numChoice >= 1 && numChoice <= butikOptions.length) {
        currentAntamURL = butikOptions[numChoice - 1];
        if (currentAntamURL === "Custom URL") {
             const customUrl = prompt("Masukkan URL kustom (harus diawali http/https): ");
             currentAntamURL = customUrl.trim();
        }
        logger.info(`[CONFIG] URL tujuan diatur ke: ${currentAntamURL}`);
    } else if (choice.trim().toLowerCase().startsWith('http') || choice.trim().toLowerCase().startsWith('file://')) {
        currentAntamURL = choice.trim();
        logger.info(`[CONFIG] URL kustom diatur ke: ${currentAntamURL}`);
    } else {
        logger.error("[ERROR] Pilihan atau format URL tidak valid.");
    }
}


// --- FUNGSI MENU UTAMA INTERAKTIF (Hanya untuk update penomoran) ---
async function displayMainMenu() {
  let continueLoop = true;
  while (continueLoop) {
    logger.info("\n====================================");
    logger.info("       ANTAM BOT WAR - MENU");
    logger.info("====================================");
    logger.info("1. Manual Input (1 NIK)");
    logger.info("2. Input JSON File (Multi NIK - PARALEL)");
    logger.info("3. Input CSV File (Multi NIK - PARALEL)");
    logger.info("4. SHOW REGISTRATION STATUS");
    logger.info(`5. CHANGE BOUTIQUE (Active URL): ${currentAntamURL})`);
    logger.info("6. Exit");
    logger.info("------------------------------------");

    const choice = prompt("Select mode (1/2/3/4/5/6): ");

    switch (choice.trim()) {
      case "1":
        await processManualInput();
        break;
      case "2":
        const jsonPath = prompt("Enter the JSON File Path (ex: users.json): ");
        await processUserData(jsonPath.trim());
        break;
      case "3":
        const csvPath = prompt("Enter CSV File Path (ex: users.csv): ");
        await processCSVData(csvPath.trim());
        break;
      case "4":
        await displayStatus();
        break;
      case "5":
        setAntamURL();
        break;
      case "6":
        logger.info("[EXIT] Program terminated.");
        continueLoop = false;
        break;
      default:
        logger.error("[ERROR] Pilihan tidak valid. Silakan coba lagi.");
    }
    if (continueLoop) {
      await randomDelay(1000, 1000);
    }
  }
}
// --- EKSEKUSI UTAMA ---
displayMainMenu();
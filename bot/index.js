// antam-bot-war/bot/index.js (VERSI LIVE BUTIK GRAHA DIPTA - STABIL DENGAN RETRY)

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
const Table = require("cli-table3"); // Untuk menampilkan tabel status

// --- KONFIGURASI UMUM ---
const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");

// !!! GANTI URL KE BUTIK ANTAM YANG AKAN DILAKUKAN WAR !!!
// Saat ini diatur ke Graha Dipta, ganti ke Serpong jika ingin uji coba form aktif
const ANTAM_URL = "https://antrigrahadipta.com/";
// const ANTAM_URL = "https://antributikserpong.com/";

const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;
const LIST_REGISTRATIONS_ENDPOINT = `${LARAVEL_API_URL}/bot/list-registrations`;

// --- DATA DUMMY TEMPLATE ---
const USER_DATA_TEMPLATE = {
  name: "Anto Santoso",
  nik: "3175030203870007",
  phone_number: "085695810460",
  branch: "BUTIK EMAS GRAHA CIPTA", // Ganti nama cabang
  branch_selector: "GRAHA CIPTA",
  purchase_date: "2025-10-29",
};

const MAX_RETRIES = 5; // Maksimal percobaan ulang jika gagal memuat halaman/form

// Tambahkan plugin stealth ke Puppeteer
puppeteer.use(StealthPlugin());

// --- UTILITY FUNGSI ---
const randomDelay = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

// --- FUNGSI INTI OTOMASI FORM (DIADAPTASI KE FORM GRAHA DIPTA/SERPONG) ---
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
  await page.click('button[type="submit"]'); // Tetap gunakan selector umum ini
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
    // Cek pesan error validasi (jika form tidak redirect)
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

    // Fallback: Gagal total
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

// --- FUNGSI UTAMA BOT ENGINE PER NIK (DENGAN RETRY LOOP) ---
async function runAntamWar(userData) {
  let browser;
  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  // PERBAIKAN: launchOptions dideklarasikan di luar try/catch (Scope Variabel)
  const launchOptions = {
    // GANTI KE `false` jika Anda ingin melihat browser terbuka saat WAR
    headless: false,
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
      // Tutup browser jika ada sisa dari loop sebelumnya
      if (browser) await browser.close();

      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      // 1. GOTO URL
      logger.info(`[RETRY] Navigating to ${ANTAM_URL}...`);
      await page.goto(ANTAM_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000, // Timeout navigasi 60 detik
      });

      // 2. TUNGGU FORM MUNCUL
      logger.info("[RETRY] Waiting for form selector '#name'...");
      await page.waitForSelector("#name", { timeout: 20000 }); // Timeout selektor 20 detik

      // Jika berhasil sampai sini, anggap form sudah termuat
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
        `[ATTEMPT ${attempt}] Failed to load form or complete filling: ${error.message}`
      );

      // Jika ini adalah percobaan terakhir, catat sebagai gagal
      if (attempt === MAX_RETRIES) {
        logger.error(
          `[CRITICAL ERROR] Max retries reached for NIK ${userData.nik}. Stopping.`
        );
        registrationResult.status = "FAILED";
        registrationResult.raw_response = {
          error: `Max retries reached: ${error.message}`,
        };
      } else {
        // Tunggu sebelum mencoba lagi
        logger.info("[RETRY] Waiting 3-5 seconds before next attempt...");
        await randomDelay(3000, 5000);
      }
    } finally {
      // Menutup browser hanya setelah selesai (sukses atau gagal total)
      if (success || attempt === MAX_RETRIES) {
        if (browser) {
          // Jika mode headless: true, tutup segera. Jika false, tunggu sebentar.
          if (launchOptions.headless) {
            await browser.close();
            logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
          } else {
            logger.info(
              `[JOB] Browser kept open for debug for NIK: ${userData.nik}`
            );
            await randomDelay(5000, 10000);
            await browser.close();
            logger.info(
              `[JOB] Browser closed after delay for NIK: ${userData.nik}`
            );
          }
        }
      }
    }
  }
  // END LOOP PERCOBAAN ULANG

  // Kirim hasil akhir ke Laravel
  await sendRegistrationResult({ ...userData, ...registrationResult });
  logger.info(`[JOB] Finished job for NIK: ${userData.nik}`);
}

// --- FUNGSI INPUT MANUAL DENGAN VALIDASI ---
async function processManualInput() {
  logger.info("\n--- MODE INPUT MANUAL ---");

  const name = prompt("Masukkan Nama: ");

  // --- NIK VALIDATION LOOP ---
  let nik;
  do {
    nik = prompt("Masukkan NIK (16 digit): ");
    if (nik.trim().length !== 16 || isNaN(nik.trim())) {
      logger.error(
        "[VALIDASI] NIK harus tepat 16 digit dan berupa angka. Coba lagi."
      );
    }
  } while (nik.trim().length !== 16 || isNaN(nik.trim()));

  // --- PHONE VALIDATION LOOP ---
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

  logger.info(`[MANUAL] Starting job for NIK: ${userData.nik}`);
  await runAntamWar(userData);
}

// --- FUNGSI PROSES UTAMA (Multi-NIK JSON - PERBAIKAN KEY MAPPING) ---
async function processUserData(dataFilePath) {
  logger.info(`[CLI] Reading user data from: ${dataFilePath}`);

  // 1. Baca dan Parse File
  let rawData;
  try {
    rawData = fs.readFileSync(dataFilePath);
  } catch (e) {
    logger.error(`[FATAL] Could not read data file: ${e.message}`);
    return;
  }

  let userList;
  try {
    userList = JSON.parse(rawData);
  } catch (e) {
    logger.error(`[FATAL] Failed to parse JSON data: ${e.message}`);
    return;
  }

  if (!Array.isArray(userList) || userList.length === 0) {
    logger.error("[FATAL] Data file must contain a non-empty array of users.");
    return;
  }

  logger.info(
    `[CLI] Found ${userList.length} users. Starting sequential processing...`
  );

  // 2. Proses Setiap NIK Secara Berurutan (Sequential)
  for (const [index, userEntry] of userList.entries()) {
    // PERBAIKAN: Pemetaan key dari JSON ke format bot
    const userData = {
      ...USER_DATA_TEMPLATE,
      name: userEntry.nama || userEntry.name, // Mendukung 'nama' atau 'name'
      nik: userEntry.nik,
      phone_number: userEntry.telepon || userEntry.phone_number, // Mendukung 'telepon' atau 'phone_number'
    };

    logger.info(`\n--- Starting Job ${index + 1}/${userList.length} ---`);
    await runAntamWar(userData);

    // Jeda antar job
    await randomDelay(5000, 10000);
  }

  logger.info("[CLI] All user jobs completed.");
}

// --- FUNGSI PROSES INPUT CSV ---
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
        // Pastikan CSV Anda menggunakan header 'name', 'nik', 'phone_number'
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

  const userListLength = userList.length;

  for (const [index, userEntry] of userList.entries()) {
    logger.info(`\n--- Starting Job ${index + 1}/${userListLength} ---`);
    await runAntamWar(userEntry);

    await randomDelay(5000, 10000);
  }

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

// --- FUNGSI MENU UTAMA INTERAKTIF (Revisi Total untuk Stabilitas) ---
async function displayMainMenu() {
  let continueLoop = true;
  while (continueLoop) {
    logger.info("\n====================================");
    logger.info("       ANTAM BOT WAR - MENU");
    logger.info("====================================");
    logger.info("1. Input Manual (1 NIK)");
    logger.info("2. Input File JSON (Multi NIK)");
    logger.info("3. Input File CSV (Multi NIK)");
    logger.info("4. TAMPILKAN STATUS REGISTRASI");
    logger.info("5. Keluar");
    logger.info("------------------------------------");

    const choice = prompt("Pilih mode (1/2/3/4/5): ");

    switch (choice.trim()) {
      case "1":
        await processManualInput();
        break;
      case "2":
        const jsonPath = prompt("Masukkan Path File JSON (ex: users.json): ");
        await processUserData(jsonPath.trim());
        break;
      case "3":
        const csvPath = prompt("Masukkan Path File CSV (ex: users.csv): ");
        await processCSVData(csvPath.trim());
        break;
      case "4":
        await displayStatus();
        break;
      case "5":
        logger.info("[EXIT] Program dihentikan.");
        continueLoop = false;
        break;
      default:
        logger.error("[ERROR] Pilihan tidak valid. Silakan coba lagi.");
    }
    // Jeda kecil sebelum kembali ke loop
    if (continueLoop) {
      await randomDelay(1000, 1000);
    }
  }
}
// --- EKSEKUSI UTAMA ---
displayMainMenu();

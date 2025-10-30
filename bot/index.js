// antam-bot-war/bot/index.js (VERSI FINAL TERBARU DENGAN CUSTOM SCHEDULING)

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
const boxen = require("boxen").default;
const gradient = require("gradient-string").default;
const figlet = require("figlet");
const chalk = require("chalk");

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
  // Cek h4 yang mengandung "Nomor Antrian Anda"
  const successIndicator = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll("h4"));
    const successEl = elements.find((el) =>
      el.textContent.includes("Nomor Antrian Anda")
    );
    return successEl ? successEl.textContent : null;
  });

  if (successIndicator) {
    // Ambil hanya nomor tiketnya, pastikan tidak mengambil teks lain
    const ticketNumberMatch = successIndicator.match(
      /Nomor Antrian Anda\s*:?\s*(\d+)/i
    );
    const ticketNumber = ticketNumberMatch
      ? ticketNumberMatch[1].trim()
      : "TICKET_NOT_PARSED";

    return {
      status: "SUCCESS",
      ticket_number: ticketNumber,
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
  // --- 1. FIX TIMEZONE ---
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
    war_time: localWarTime,
  };

  // --- 3. LAUNCH OPTIONS (MENGATASI ERR_BLOCKED_BY_CLIENT) ---
  const launchOptions = {
    headless: true, // Ganti ke false untuk debugging
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--start-maximized",
      // Opsi untuk mencegah pemblokiran oleh ekstensi atau klien (adblock/firewall)
      "--disable-extensions-except=NONE",
      "--disable-extensions",
    ],
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
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      // 1. GOTO URL menggunakan URL yang dipilih
      logger.info(`[RETRY] Navigating to ${antamURL}...`);
      await page.goto(antamURL, {
        waitUntil: "domcontentloaded", // Gunakan domcontentloaded untuk kecepatan
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
      // Menutup browser
      if (browser) {
        // Hanya tutup jika sukses ATAU sudah mencapai max retries.
        if (success || attempt === MAX_RETRIES) {
          await browser.close();
          logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
        }
      }
    }
  }

  await sendRegistrationResult({ ...userData, ...registrationResult });
  logger.info(`[JOB] Finished job for NIK: ${userData.nik}`);
  return registrationResult;
}

// --- FUNGSI PEMBANTU UNTUK MENJALANKAN JOB SECARA PARALEL ---
async function runAllJobsInParallel(userList) {
  logger.info(`[PARALLEL] Starting ${userList.length} jobs concurrently...`);

  const tasks = userList.map((userData) => {
    return runAntamWar(userData, currentAntamURL).catch((e) => {
      logger.error(
        `[FATAL PARALLEL] Job for NIK ${userData.nik} failed unexpectedly: ${e.message}`
      );
      return { status: "FAILED_CRITICAL", nik: userData.nik };
    });
  });

  await Promise.all(tasks);

  logger.info("[PARALLEL] All concurrent jobs completed.");
}

// --- FUNGSI BARU: SCHEDULING ---
async function scheduleAntamWar(userList, targetHour, targetMinute, dataMode) {
  const now = new Date();
  const targetTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    targetHour,
    targetMinute,
    0,
    0
  );

  let timeUntilTarget = targetTime.getTime() - now.getTime();

  if (timeUntilTarget < 0) {
    logger.error("=================================================");
    logger.error(
      `[SCHEDULING] Waktu target ${targetHour
        .toString()
        .padStart(2, "0")}:${targetMinute
        .toString()
        .padStart(2, "0")}:00 WIB sudah lewat.`
    );
    logger.error("Waktu target harus di hari ini dan belum terlewat.");
    logger.error("=================================================");
    return;
  }

  // Tampilkan informasi countdown
  const hours = Math.floor(timeUntilTarget / (1000 * 60 * 60));
  const minutes = Math.floor(
    (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
  );
  const seconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);

  logger.warn("=================================================");
  logger.warn(`[SCHEDULING] Mode ${dataMode} (PARALEL) dipilih.`);
  logger.warn(`[SCHEDULING] Total NIK: ${userList.length}`);
  logger.warn(`[SCHEDULING] URL Tujuan: ${currentAntamURL}`);
  logger.warn(
    `[SCHEDULING] Bot akan dieksekusi tepat pada: ${targetTime.toLocaleTimeString(
      "id-ID",
      { hour12: false }
    )} WIB`
  );
  logger.warn(
    `[COUNTDOWN] Waktu tersisa: ${hours} jam, ${minutes} menit, ${seconds} detik.`
  );
  logger.warn("JANGAN TUTUP TERMINAL INI. Bot dalam mode SIAGA!");
  logger.warn("=================================================");

  // Set interval untuk menampilkan countdown secara real-time
  const countdownInterval = setInterval(() => {
    timeUntilTarget -= 1000;
    const currentSeconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);
    const currentMinutes = Math.floor(
      (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
    );

    if (timeUntilTarget > 60000 && currentSeconds % 10 === 0) {
      logger.info(
        `[COUNTDOWN] Waktu tersisa: ${currentMinutes} menit, ${currentSeconds} detik.`
      );
    } else if (timeUntilTarget <= 60000 && timeUntilTarget > 0) {
      logger.warn(
        `[COUNTDOWN] Waktu tersisa: ${currentMinutes} menit, ${currentSeconds} detik. SIAP!`
      );
    }

    if (timeUntilTarget < 1000) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  // Gunakan setTimeout untuk menunda eksekusi
  await new Promise((resolve) =>
    setTimeout(() => {
      logger.info("=================================================");
      logger.info(
        `[SCHEDULING] WAKTU EKSEKUSI TEPAT ${targetHour
          .toString()
          .padStart(2, "0")}:${targetMinute
          .toString()
          .padStart(2, "0")}:00! Menjalankan Antam War Paralel...`
      );
      logger.info("=================================================");
      resolve(runAllJobsInParallel(userList));
    }, timeUntilTarget)
  );

  logger.info("[SCHEDULING] Selesai mengeksekusi semua job.");
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

  // --- INPUT JAM/MENIT BARU ---
  let targetHour, targetMinute;
  do {
    const timeInput = prompt("Masukkan JAM War (HH:MM, contoh 07:00): ");
    const parts = timeInput.split(":");
    if (
      parts.length === 2 &&
      !isNaN(parseInt(parts[0])) &&
      !isNaN(parseInt(parts[1]))
    ) {
      targetHour = parseInt(parts[0]);
      targetMinute = parseInt(parts[1]);
      if (
        targetHour >= 0 &&
        targetHour <= 23 &&
        targetMinute >= 0 &&
        targetMinute <= 59
      ) {
        break;
      }
    }
    logger.error("[VALIDASI] Format jam tidak valid. Gunakan format HH:MM.");
  } while (true);
  // --- END INPUT JAM/MENIT BARU ---

  // Panggil fungsi scheduling menggunakan input jam dan menit
  await scheduleAntamWar(userList, targetHour, targetMinute, "JSON File");

  logger.info("[CLI] All JSON user jobs completed (after scheduling).");
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

  // --- INPUT JAM/MENIT BARU ---
  let targetHour, targetMinute;
  do {
    const timeInput = prompt("Masukkan JAM War (HH:MM, contoh 07:00): ");
    const parts = timeInput.split(":");
    if (
      parts.length === 2 &&
      !isNaN(parseInt(parts[0])) &&
      !isNaN(parseInt(parts[1]))
    ) {
      targetHour = parseInt(parts[0]);
      targetMinute = parseInt(parts[1]);
      if (
        targetHour >= 0 &&
        targetHour <= 23 &&
        targetMinute >= 0 &&
        targetMinute <= 59
      ) {
        break;
      }
    }
    logger.error("[VALIDASI] Format jam tidak valid. Gunakan format HH:MM.");
  } while (true);
  // --- END INPUT JAM/MENIT BARU ---

  // Panggil fungsi scheduling menggunakan input jam dan menit
  await scheduleAntamWar(userList, targetHour, targetMinute, "CSV File");

  logger.info("[CLI] All CSV user jobs completed (after scheduling).");
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
    const displayUrl = url.startsWith("file://")
      ? "MOCKUP FILE (Local HTML)"
      : url;
    console.log(`${index + 1}. ${displayUrl}`);
  });

  console.log(`\nURL Aktif Saat Ini: ${currentAntamURL}`);

  const choice = prompt("Pilih nomor butik atau masukkan URL baru: ");
  const numChoice = parseInt(choice.trim());

  if (numChoice >= 1 && numChoice <= butikOptions.length) {
    currentAntamURL = butikOptions[numChoice - 1];
    if (currentAntamURL === "Custom URL") {
      const customUrl = prompt(
        "Masukkan URL kustom (harus diawali http/https): "
      );
      currentAntamURL = customUrl.trim();
    }
    logger.info(`[CONFIG] URL tujuan diatur ke: ${currentAntamURL}`);
  } else if (
    choice.trim().toLowerCase().startsWith("http") ||
    choice.trim().toLowerCase().startsWith("file://")
  ) {
    currentAntamURL = choice.trim();
    logger.info(`[CONFIG] URL kustom diatur ke: ${currentAntamURL}`);
  } else {
    logger.error("[ERROR] Pilihan atau format URL tidak valid.");
  }
}

// --- FUNGSI MENU UTAMA INTERAKTIF ---


// --- FUNSI BANNER DENGAN GRADIENT DAN BOXEN ---
async function showBanner() {
  return new Promise((resolve, reject) => {
    figlet.text(
      "ANTAM BOT WAR",
      {
        font: "ANSI Shadow",
        horizontalLayout: "default",
        verticalLayout: "default",
      },
      (err, data) => {
        if (err) return reject(err);
        console.clear();

        // Buat teks figlet dengan gradient (tanpa boxen dulu)
        const banner = gradient("cyan", "yellow").multiline(data);
        const subtitle = gradient(
          "yellow",
          "green"
        )("AUTOMATED REGISTRATION BOT");

        // Bungkus pakai boxen dulu (tanpa warna)
        const box = boxen(`${banner}\n${subtitle}`, {
          padding: 1,
          borderStyle: "round",
          borderColor: "yellow",
          align: "center",
        });

        // Setelah itu, warnai hasil boxen secara keseluruhan
        console.log(chalk.yellowBright(box));

        resolve();
      }
    );
  });
}

// --- MENU UTAMA DENGAN GRADIENT & BOXEN ---
async function displayMainMenu() {
  let continueLoop = true;

  while (continueLoop) {

    const titleBox = boxen("✨ ANTAM BOT WAR MENU ✨", {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "cyan",
      align: "center",
    });

    console.log(chalk.cyanBright(titleBox));


   console.log(
     chalk.yellow(
       boxen("Pilih Mode Eksekusi:", {
         padding: 0.5,
         borderColor: "yellow",
         borderStyle: "round",
       })
     )
   );


    console.log(
      chalk.cyanBright("1.") +
        " 🧍 Manual Input (1 NIK)  — " +
        chalk.greenBright("EKSEKUSI SEKARANG")
    );
    console.log(
      chalk.cyanBright("2.") +
        " 🧾 Input JSON File       — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(
      chalk.cyanBright("3.") +
        " 📄 Input CSV File        — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(
      chalk.cyanBright("4.") + " 📋 Show Registration Status"
    );
    console.log(
      chalk.cyanBright("5.") +
        " 🏢 Ganti Butik (Active URL): " +
        chalk.magentaBright(currentAntamURL)
    );
    console.log(chalk.cyanBright("6.") + " 🚪 Exit");

    console.log(gradient("yellow", "green")("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

    const choice = prompt(chalk.bold("Pilih menu (1-6): "));

    // Sedikit animasi loading kecil
    console.log(gradient("cyan", "magenta")("\n⏳ Memproses pilihanmu...\n"));
    await randomDelay(500, 1200);

    switch (choice.trim()) {
      case "1":
        await processManualInput();
        break;
      case "2":
        const jsonPath = prompt("Masukkan path JSON (contoh: users.json): ");
        await processUserData(jsonPath.trim());
        break;
      case "3":
        const csvPath = prompt("Masukkan path CSV (contoh: users.csv): ");
        await processCSVData(csvPath.trim());
        break;
      case "4":
        await displayStatus();
        break;
      case "5":
        setAntamURL();
        break;
      case "6":
        console.log(
          gradient("red", "yellow")(
            "\n👋 Terima kasih telah menggunakan ANTAM BOT WAR!"
          )
        );
        continueLoop = false;
        break;
      default:
        console.log(chalk.redBright("[!] Pilihan tidak valid, coba lagi."));
    }

    if (continueLoop) {
      console.log(gradient("yellow", "green")("\nTekan ENTER untuk kembali..."));
      prompt("");
    }
  }
}

// --- EKSEKUSI UTAMA ---
(async () => {
  await showBanner(); // tampilkan banner dulu
  await displayMainMenu(); // lalu tampilkan menu
})();

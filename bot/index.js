// antam-bot-war/bot/index.js (FINAL VERSION - STABIL & INTERAKTIF)

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
const ANTAM_URL = `file://${MOCKUP_FILE}`; // Digunakan untuk debug/dev
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;
const LIST_REGISTRATIONS_ENDPOINT = `${LARAVEL_API_URL}/bot/list-registrations`;

// --- DATA DUMMY TEMPLATE ---
const USER_DATA_TEMPLATE = {
  name: "Budi Santoso",
  nik: "1234567890123000",
  phone_number: "081234567890",
  branch: "BUTIK EMAS SARINAH",
  branch_selector: "SARINAH",
  purchase_date: "2025-11-01",
};

// Tambahkan plugin stealth ke Puppeteer
puppeteer.use(StealthPlugin());

// --- UTILITY FUNGSI ---
const randomDelay = (min, max) => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

// --- FUNGSI INTI OTOMASI FORM (DIADAPTASI KE FORM SERPONG) ---
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
  // Asumsi ID input Nama KTP di form dummy adalah #nama
  await page.type("#nama", data.name, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing NIK: ${data.nik}`);
  // Asumsi ID input Nomor KTP di form dummy adalah #nik
  await page.type("#nik", data.nik, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing Phone: ${data.phone_number}`);
  // Asumsi ID input Nomor HP di form dummy adalah #no_hp
  await page.type("#no_hp", data.phone_number, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  // 3. MENGKLIK CHECKBOX PERSETUJUAN
  logger.info("[INPUT] Clicking KTP agreement checkbox...");
  // ID dari HTML dummy (berdasarkan screenshot)
  await page.click("#ktp_agreement");
  await randomDelay(500, 800);

  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox...");
  // ID dari HTML dummy
  await page.click("#stock_agreement");
  await randomDelay(500, 1000);

  // 4. MEMBACA DAN MENGISI CAPTCHA TEKS
  logger.info("[CAPTCHA] Reading static Captcha text...");
  // Captcha text diambil dari elemen dengan ID #captcha_text
  const captchaText = await page.$eval("#captcha_text", (el) => el.textContent);
  logger.info(`[CAPTCHA] Text found: ${captchaText}`);

  logger.info("[CAPTCHA] Typing Captcha answer...");
  // Jawaban diketik ke elemen input dengan ID #captcha_input
  await page.type("#captcha_input", captchaText, {
    delay: randomDelay(100, 250),
  });
  await randomDelay(1000, 2000);

  // 5. SUBMIT FORM
  logger.info("[FORM] Clicking submit button...");
  await page.click("#submit_button_id");
  await randomDelay(2000, 3000);

  // 6. DETEKSI HASIL (Simulasi)
  const successMessage = await page.$eval(
    "#status_message",
    (el) => el.textContent
  );
  logger.info(`[RESULT] Message on screen: ${successMessage}`);

  if (successMessage.includes("berhasil")) {
    return {
      status: "SUCCESS",
      ticket_number: successMessage.split(":")[1].trim(),
    };
  } else {
    return { status: "FAILED", ticket_number: null };
  }
}

// --- FUNGSI API KE LARAVEL ---
async function sendRegistrationResult(data) {
  // Fungsi tetap sama: mengirim hasil ke API Laravel
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

// --- FUNGSI UTAMA BOT ENGINE PER NIK ---
async function runAntamWar(userData) {
  let browser;
  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  logger.info(`[JOB] Starting job for NIK: ${userData.nik}`);

  try {
    browser = await puppeteer.launch({
      // PENTING: Ubah 'false' ke 'true' ketika ingin menjalankan WAR tanpa tampilan (Headless Mode)
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--start-maximized"],
      defaultViewport: null,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    await page.goto(ANTAM_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const resultFromForm = await handleFormFilling(page, userData);

    const finalPageContent = await page.content();

    registrationResult = {
      ...registrationResult,
      ...resultFromForm,
      raw_response: {
        success_page_content: finalPageContent.substring(0, 500),
      },
    };
  } catch (error) {
    logger.error(
      `[CRITICAL ERROR] Bot execution failed for NIK ${userData.nik}: ${error.message}`
    );
    registrationResult.status = "FAILED";
    registrationResult.raw_response = { error: error.message };
  } finally {
    if (browser) {
      await browser.close();
      logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
    }

    // Kirim hasil akhir ke Laravel
    await sendRegistrationResult({ ...userData, ...registrationResult });
    logger.info(`[JOB] Finished job for NIK: ${userData.nik}`);
  }
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

  const branch = prompt("Masukkan Nama Cabang (ex: BUTIK EMAS SARINAH): ");
  const branch_selector = prompt("Masukkan Selector Cabang (ex: SARINAH): ");

  // Asumsi tanggal tetap 2025-11-01 atau bisa ditanyakan juga
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

// --- FUNGSI PROSES UTAMA (Multi-NIK JSON) ---
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
    const userData = {
      ...USER_DATA_TEMPLATE,
      ...userEntry,
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

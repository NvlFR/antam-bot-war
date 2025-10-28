// antam-bot-war/bot/index.js (FINAL VERSION for Multi-NIK)

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const path = require("path");
const fs = require("fs"); // Tambahkan fs untuk membaca file
const yargs = require("yargs/yargs"); // Tambahkan yargs untuk CLI
const csv = require("csv-parser");
const { hideBin } = require("yargs/helpers");
const prompt = require("prompt-sync")({ sigint: true });
const logger = require("./logger");

// --- KONFIGURASI UMUM ---
const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const ANTAM_URL = `file://${MOCKUP_FILE}`;
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;

// --- DATA DUMMY TEMPLATE (Akan ditimpa oleh data file) ---
const USER_DATA_TEMPLATE = {
  name: "Budi Santoso",
  nik: "1234567890123000", // Akan diganti
  phone_number: "081234567890",
  branch: "BUTIK EMAS SARINAH", // KRITIS: Harus 'branch'
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

// --- FUNGSI INTI OTOMASI FORM ---
async function handleFormFilling(page, data) {
  logger.info("[FORM] Starting form automation...");

  // 1. SCROLL ALAMI
  // ... (kode handleFormFilling tetap sama seperti sebelumnya)
  logger.info("[BEHAVIOUR] Simulating initial scroll...");
  await page.evaluate(() => {
    window.scrollBy(0, 500 + Math.floor(Math.random() * 200));
  });
  await randomDelay(1000, 2000);

  // 2. MENGISI INPUT DENGAN DELAY ALAMI
  logger.info(`[INPUT] Typing NIK: ${data.nik}`);
  await page.type("#nik", data.nik, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing Name: ${data.name}`);
  await page.type("#nama", data.name, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  logger.info(`[INPUT] Typing Phone: ${data.phone_number}`);
  await page.type("#no_hp", data.phone_number, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  // 3. MEMILIH DROPDOWN
  logger.info(`[INPUT] Selecting branch: ${data.branch}`); // KRITIS: Gunakan data.branch
  await page.select("#cabang_id", data.branch_selector);
  await randomDelay(500, 1000);

  // 4. MENGISI TANGGAL
  logger.info(`[INPUT] Setting date: ${data.purchase_date}`);
  await page.evaluate((date) => {
    document.getElementById("tanggal_pembelian").value = date;
  }, data.purchase_date);
  await randomDelay(500, 1000);

  // 5. INTERAKSI CAPTCHA v3 DUMMY
  logger.info("[BEHAVIOUR] Mouse movement simulation for CAPTCHA v3...");
  await page.mouse.move(100, 100);
  await randomDelay(100, 300);
  await page.mouse.move(600, 700);
  await randomDelay(500, 1000);

  // 6. SUBMIT FORM
  logger.info("[FORM] Clicking submit button...");
  await page.click("#submit_button_id");
  await randomDelay(2000, 3000);

  // 7. DETEKSI HASIL (Simulasi)
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
      headless: true, // Kembali ke headless: true untuk efisiensi war
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

async function processManualInput() {
  logger.info("\n--- MODE INPUT MANUAL ---");

  const name = prompt("Masukkan Nama: ");
  const nik = prompt("Masukkan NIK (16 digit): ");
  const phone_number = prompt("Masukkan No. HP (08xx): ");
  const branch = prompt("Masukkan Nama Cabang (ex: BUTIK EMAS SARINAH): ");
  const branch_selector = prompt("Masukkan Selector Cabang (ex: SARINAH): ");

  // Asumsi tanggal tetap 2025-11-01 atau bisa ditanyakan juga
  const purchase_date =
    prompt("Masukkan Tanggal Pembelian (YYYY-MM-DD, default 2025-11-01): ") ||
    "2025-11-01";

  const userData = {
    ...USER_DATA_TEMPLATE,
    name,
    nik,
    phone_number,
    branch,
    branch_selector,
    purchase_date,
  };

  logger.info(`[MANUAL] Starting job for NIK: ${userData.nik}`);
  await runAntamWar(userData); // Jalankan job satu per satu
}

// --- FUNGSI PROSES UTAMA (Multi-NIK) ---
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
  // Mode sequential lebih aman agar tidak membanjiri sistem dengan terlalu banyak browser
  for (const [index, userEntry] of userList.entries()) {
    // Gabungkan data template dengan data user spesifik
    const userData = {
      ...USER_DATA_TEMPLATE,
      ...userEntry,
    };

    logger.info(`\n--- Starting Job ${index + 1}/${userList.length} ---`);
    await runAntamWar(userData);

    // Jeda antar job (untuk menghindari deteksi bot dan membiarkan sistem bernapas)
    await randomDelay(5000, 10000);
  }

  logger.info("[CLI] All user jobs completed.");
}

// antam-bot-war/bot/index.js (GANTI BAGIAN EKSEKUSI UTAMA)

// --- FUNGSI PROSES INPUT CSV (Baru) ---
// antam-bot-war/bot/index.js (Ganti fungsi processCSVData)

// --- FUNGSI PROSES INPUT CSV ---
async function processCSVData(dataFilePath) {
    logger.info(`[CLI] Reading user data from CSV: ${dataFilePath}`);
    
    const userList = await new Promise((resolve, reject) => {
        const results = [];
        
        // Cek apakah file ada sebelum mencoba membacanya
        if (!fs.existsSync(dataFilePath)) {
            logger.error(`[FATAL] File not found: ${dataFilePath}`);
            return resolve([]);
        }

        fs.createReadStream(dataFilePath)
            .pipe(csv())
            .on('data', (data) => {
                // Tambahkan data template untuk memastikan field seperti 'war_time' ada
                const userData = {
                    ...USER_DATA_TEMPLATE,
                    ...data,
                };
                results.push(userData);
            })
            .on('end', () => {
                logger.info(`[CLI] Successfully parsed ${results.length} records from CSV.`);
                resolve(results);
            })
            .on('error', (err) => {
                logger.error(`[FATAL] Error reading CSV file: ${err.message}`);
                reject(err);
            });
    });

    if (!Array.isArray(userList) || userList.length === 0) {
        logger.error("[FATAL] CSV file is empty or could not be processed.");
        return;
    }

    // Lanjutkan ke proses bot (Kita akan menggunakan logika sequential/paralel dari processUserData)
    // Gunakan kembali logika loop dari processUserData, tetapi hanya untuk menjalankan bot
    const userListLength = userList.length;
    
    for (const [index, userEntry] of userList.entries()) {
        logger.info(`\n--- Starting Job ${index + 1}/${userListLength} ---`);
        await runAntamWar(userEntry);

        // Jeda antar job (untuk menghindari deteksi bot dan membiarkan sistem bernapas)
        await randomDelay(5000, 10000); 
    }

    logger.info("[CLI] All CSV user jobs completed.");
}

// ... (Fungsi displayMainMenu di bagian bawah sudah otomatis memanggil fungsi ini saat opsi 3 dipilih)

// --- FUNGSI MENU UTAMA INTERAKTIF ---
function displayMainMenu() {
    logger.info("\n====================================");
    logger.info("       ANTAM BOT WAR - MENU");
    logger.info("====================================");
    logger.info("1. Input Manual (1 NIK)");
    logger.info("2. Input File JSON (Multi NIK)");
    logger.info("3. Input File CSV (Multi NIK) - Belum Tersedia");
    logger.info("4. Keluar");
    logger.info("------------------------------------");

    const choice = prompt("Pilih mode (1/2/3/4): ");

    switch (choice.trim()) {
        case '1':
            processManualInput();
            break;
        case '2':
            const jsonPath = prompt("Masukkan Path File JSON (ex: users.json): ");
            processUserData(jsonPath.trim());
            break;
        case '3':
            const csvPath = prompt("Masukkan Path File CSV (ex: users.csv): ");
            processCSVData(csvPath.trim());
            break;
        case '4':
            logger.info("[EXIT] Program dihentikan.");
            return;
        default:
            logger.error("[ERROR] Pilihan tidak valid. Silakan coba lagi.");
            displayMainMenu();
    }
}

// --- EKSEKUSI UTAMA ---
// Kita tidak lagi menggunakan Yargs commands, hanya menjalankan fungsi menu utama.
displayMainMenu();

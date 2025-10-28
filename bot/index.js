// // antam-bot-war/bot/index.js

// const puppeteer = require("puppeteer-extra");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// const axios = require("axios");
// // Import Winston atau Logger lain jika sudah diinstal
// // const logger = require('./logger');

// // --- KONFIGURASI ---
// const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
// const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;
// const ANTAM_URL = "https://butik.antam.com/antrian-online/"; // Ganti dengan URL antrian yang benar
// const USER_DATA = {
//   name: "Budi Santoso",
//   nik: "1234567890123456", // Ganti dengan NIK yang unik untuk testing!
//   phone_number: "081234567890",
//   branch_name: "BUTIK EMAS SARINAH", // Sesuaikan dengan nilai di form Antam
//   branch_selector: '#branch option[value="SARINAH"]', // Selector untuk option di dropdown
//   purchase_date: "2025-11-01",
//   // ... data lain (misalnya email, dll)
// };

// // Tambahkan plugin stealth ke Puppeteer
// puppeteer.use(StealthPlugin());

// /**
//  * Fungsi utama untuk menjalankan war antrian.
//  */
// async function runAntamWar() {
//   let browser;
//   let registrationResult = {
//     status: "FAILED",
//     ticket_number: null,
//     raw_response: null,
//     war_time: new Date().toISOString().slice(0, 19).replace("T", " "),
//   };

//   try {
//     // Luncurkan browser dengan opsi human-like
//     browser = await puppeteer.launch({
//       headless: true, // Ubah ke false jika ingin melihat visual (debug)
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         // Tambahkan argumen lain untuk menghindari deteksi
//       ],
//     });

//     const page = await browser.newPage();

//     // Atur viewport standar manusia
//     await page.setViewport({ width: 1366, height: 768 });

//     logger.info(`[BOT] Navigating to Antam Queue URL...`);
//     await page.goto(ANTAM_URL, {
//       waitUntil: "domcontentloaded",
//       timeout: 30000,
//     });

//     // --- MASUK KE FASE 3.2: OTOMASI PENGISIAN FORM ---
//     await handleFormFilling(page, USER_DATA);

//     // Setelah form terisi dan disubmit, ambil hasilnya
//     registrationResult.status = "SUCCESS"; // Perlu logika deteksi sukses/gagal yang lebih baik
//     registrationResult.ticket_number = "DUMMY-TICKET-2025"; // Ambil nomor tiket dari halaman
//   } catch (error) {
//     logger.error(`[CRITICAL ERROR] Bot execution failed: ${error.message}`);
//     // Ambil screenshot saat error untuk debugging
//     // await page.screenshot({ path: `logs/error-${Date.now()}.png` });
//     registrationResult.status = "FAILED";
//     registrationResult.raw_response = { error: error.message };
//   } finally {
//     if (browser) {
//       await browser.close();
//       logger.info("[BOT] Browser closed.");
//     }

//     // Kirim hasil akhir ke Laravel
//     await sendRegistrationResult({ ...USER_DATA, ...registrationResult });

//     // ... (Tambahkan fungsi sendRegistrationResult di bawah handleFormFilling)

//     // --- FUNGSI API KE LARAVEL (sama seperti sebelumnya) ---
//     async function sendRegistrationResult(data) {
//       // ... (kode axios untuk POST ke SAVE_RESULT_ENDPOINT)

//       // Contoh sederhana:
//       try {
//         const response = await axios.post(SAVE_RESULT_ENDPOINT, data);
//         logger.info(
//           "[SUCCESS] Result sent to Laravel:",
//           response.data.registration_id
//         );
//       } catch (error) {
//         logger.error("[FATAL] Failed to send result to Laravel.");
//       }
//     }

//     // --- JALANKAN BOT ---
//     runAntamWar();
//   }
// }

// // --- UTILITY FUNGSI UNTUK PERILAKU MANUSIA ---

// /**
//  * Menghasilkan delay acak antara min (ms) dan max (ms)
//  */
// const randomDelay = (min, max) => {
//     const delay = Math.floor(Math.random() * (max - min + 1)) + min;
//     return new Promise(resolve => setTimeout(resolve, delay));
// };

// /**
//  * Fungsi inti untuk mengisi form
//  */
// async function handleFormFilling(page, data) {
//     logger.info('[FORM] Starting form automation...');

//     // 1. SCROLL ALAMI (Simulasi pengguna membaca halaman)
//     logger.info('[BEHAVIOUR] Simulating initial scroll...');
//     await page.evaluate(() => {
//         window.scrollBy(0, 500 + Math.floor(Math.random() * 200));
//     });
//     await randomDelay(1000, 2000); // Tunggu sebentar

//     // 2. MENGISI INPUT DENGAN DELAY ALAMI

//     // Mengisi NIK
//     logger.info(`[INPUT] Typing NIK: ${data.nik}`);
//     await page.type('#nik', data.nik, { delay: randomDelay(50, 150) });
//     await randomDelay(300, 700); // Jeda setelah input penting

//     // Mengisi Nama
//     logger.info(`[INPUT] Typing Name: ${data.name}`);
//     await page.type('#nama', data.name, { delay: randomDelay(50, 150) });
//     await randomDelay(300, 700);

//     // Mengisi Nomor HP
//     logger.info(`[INPUT] Typing Phone: ${data.phone_number}`);
//     await page.type('#no_hp', data.phone_number, { delay: randomDelay(50, 150) });
//     await randomDelay(300, 700);

//     // 3. MEMILIH DROPDOWN (Cabang)
//     logger.info(`[INPUT] Selecting branch: ${data.branch_name}`);
//     await page.select('#cabang_id', data.branch_selector); // Sesuaikan ID elemen form
//     await randomDelay(500, 1000);

//     // 4. MENGKLIK TANGGAL (Jika ada kalender, ini harus diatasi)
//     // Untuk saat ini, kita anggap sudah ada elemen input tanggal
//     logger.info(`[INPUT] Selecting date: ${data.purchase_date}`);
//     await page.type('#tanggal_pembelian', data.purchase_date); // Sesuaikan ID elemen form
//     await randomDelay(500, 1000);

//     // --- LOKASI CAPTCHA V3 DENGAN INTERAKSI DUMMY (Fase 3.5) ---
//     // Sebelum submit, lakukan interaksi tambahan untuk skor CAPTCHA tinggi
//     logger.info('[BEHAVIOUR] Mouse movement simulation for CAPTCHA v3...');
//     await page.mouse.move(100, 100);
//     await randomDelay(100, 300);
//     await page.mouse.move(500 + Math.random() * 200, 500 + Math.random() * 200);
//     await randomDelay(500, 1000);

//     // 5. SUBMIT FORM
//     logger.info('[FORM] Submitting the form...');
//     await page.click('#submit_button_id'); // KRITIS: Ganti dengan ID/Selector tombol submit yang benar

//     // Tunggu navigasi halaman atau munculnya elemen hasil
//     await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {
//         logger.info('[WARNING] Navigation timeout, checking current page for result...');
//     });

//     // Setelah ini, harus ada logika untuk mendeteksi pesan sukses/gagal dan mengambil nomor tiket.
// }

// antam-bot-war/bot/index.js
// antam-bot-war/bot/index.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const axios = require("axios");
const path = require("path");
const logger = require("./logger"); // Pastikan file logger.js sudah ada

// --- KONFIGURASI ---
const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const ANTAM_URL = `file://${MOCKUP_FILE}`;
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const SAVE_RESULT_ENDPOINT = `${LARAVEL_API_URL}/bot/save-result`;

const USER_DATA = {
  name: "Syiful Bahri",
  nik: "3175030810780008", // UBAH ke NIK UNIK untuk uji coba
  phone_number: "087865369021",
  // UBAH: Gunakan 'branch' sesuai harapan Laravel Controller
  branch: "BUTIK EMAS SARINAH",
  branch_selector: "SARINAH",
  purchase_date: "2025-11-01",
};

// Tambahkan plugin stealth ke Puppeteer
puppeteer.use(StealthPlugin());

// --- UTILITY FUNGSI UNTUK PERILAKU MANUSIA ---
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

  // 3. MEMILIH DROPDOWN (Cabang #cabang_id)
  logger.info(`[INPUT] Selecting branch: ${data.branch}`);
  await page.select("#cabang_id", data.branch_selector);
  await randomDelay(500, 1000);

  // 4. MENGISI TANGGAL (#tanggal_pembelian)
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

  await randomDelay(2000, 3000); // Tunggu hasil simulasi

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

// --- FUNGSI UTAMA BOT ENGINE ---
async function runAntamWar() {
  let browser;
  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {}, // Diinisialisasi sebagai objek kosong
    war_time: new Date().toISOString().slice(0, 19).replace("T", " "), // Format YYYY-MM-DD HH:MM:SS
  };

  try {
    browser = await puppeteer.launch({
      headless: false, // Untuk melihat visualisasi
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1000,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });

    logger.info(`[BOT] Navigating to Mockup URL: ${ANTAM_URL}`);
    await page.goto(ANTAM_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Jalankan pengisian form
    const resultFromForm = await handleFormFilling(page, USER_DATA);

    // Ambil konten halaman saat sukses untuk raw_response
    const finalPageContent = await page.content(); 
    
    // Gabungkan hasil dari form filling
    registrationResult = {
      ...registrationResult,
      ...resultFromForm,
      raw_response: { // Timpa raw_response saat sukses
        success_page_content: finalPageContent.substring(0, 500)
      }
    };
    
  } catch (error) {
    logger.error(`[CRITICAL ERROR] Bot execution failed: ${error.message}`);
    // --- IMPLEMENTASI SCREENSHOT OTOMATIS (Fase 4.3) ---
    // (Tambahkan logika path screenshot di sini jika diinginkan)

    registrationResult.status = "FAILED";
    registrationResult.raw_response = { error: error.message };
  } finally {
    logger.info("[INFO] Browser terbuka 5 detik sebelum ditutup...");
    await randomDelay(5000, 5000);

    if (browser) {
      await browser.close();
      logger.info("[BOT] Browser closed.");
    }

    // Kirim hasil akhir ke Laravel
    await sendRegistrationResult({ ...USER_DATA, ...registrationResult });
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
    logger.error("[FATAL] Failed to send result to Laravel. Check DB/Validation.");

    if (error.response) {
      logger.error(`Status API: ${error.response.status}`);
      // KRITIS: Menampilkan detail 'errors' dari response 422 Laravel
      if (error.response.data && error.response.data.errors) {
        logger.error('Validation Errors:', JSON.stringify(error.response.data.errors, null, 2));
      } else {
        logger.error('API Error Response:', JSON.stringify(error.response.data, null, 2));
      }
    } else {
      logger.error(`Error details: ${error.message}`);
    }
  }
}

runAntamWar();
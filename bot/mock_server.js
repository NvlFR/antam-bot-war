// antam-bot-war/bot/mock_server.js (VERSI "CHAOS")

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 9090;
const MOCKUP_HTML_PATH = path.join(__dirname, "mockup_form.html");

// --- KONFIGURASI KEKACAUAN (CHAOS) ---
// Total harus 100
const SUCCESS_RATE_PERCENT = 20; // 20% request akan berhasil
const TIMEOUT_RATE_PERCENT = 30; // 30% request akan lambat
const FAIL_RATE_PERCENT = 50; // 50% request akan langsung gagal
// -------------------------------------

// Baca file mockup
let mockupHtmlContent = "";
try {
  mockupHtmlContent = fs.readFileSync(MOCKUP_HTML_PATH, "utf8");
} catch (e) {
  console.error(`[FATAL] Gagal membaca ${MOCKUP_HTML_PATH}`);
  process.exit(1);
}

// Endpoint utama yang diserang bot
app.get("/", (req, res) => {
  const chance = Math.floor(Math.random() * 100); // Angka 0-99
  const clientIp = req.ip;

  if (chance < FAIL_RATE_PERCENT) {
    // SKENARIO 1: GAGAL (50% KEMUNGKINAN)
    console.log(
      `[MOCK SERVER] NIK (dari ${clientIp}) GAGAL. Melempar 503 Service Unavailable.`
    );
    res
      .status(503)
      .send(
        "<html><head><title>503 Service Unavailable</title></head><body><h1>Service Temporarily Unavailable</h1><p>Simulasi server down (503).</p></body></html>"
      );
  } else if (chance < FAIL_RATE_PERCENT + TIMEOUT_RATE_PERCENT) {
    // SKENARIO 2: LAMBAT (30% KEMUNGKINAN)
    console.log(
      `[MOCK SERVER] NIK (dari ${clientIp}) LAMBAT. Menunda 60 detik...`
    );
    setTimeout(() => {
      res
        .status(200)
        .send(
          "<html><title>Slow Page</title><body><h1>Halaman Lambat</h1></body></html>"
        );
    }, 60000); // Tunda 60 detik, akan di-timeout oleh bot (yang 30 detik)
  } else {
    // SKENARIO 3: SUKSES (20% KEMUNGKINAN)
    console.log(
      `[MOCK SERVER] NIK (dari ${clientIp}) BERUNTUNG! Mengirim form...`
    );
    res.status(200).send(mockupHtmlContent);
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[MOCK SERVER "CHAOS"] Berjalan di http://127.0.0.1:${PORT}`);
  console.log("Konfigurasi:");
  console.log(`  - SUKSES: ${SUCCESS_RATE_PERCENT}%`);
  console.log(`  - LAMBAT: ${TIMEOUT_RATE_PERCENT}%`);
  console.log(`  - GAGAL:  ${FAIL_RATE_PERCENT}%`);
  console.log("Server siap diserang oleh bot paralel Anda.");
});

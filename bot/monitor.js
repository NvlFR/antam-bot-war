// bot/monitor.js
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
// const prompt = require("prompt-sync")({ sigint: true }); // <-- BARIS INI DIHAPUS

// --- KONFIGURASI ---
const CONFIG_FILE_PATH = path.join(__dirname, "active_config.json");
const SIGNAL_FILE = path.join(__dirname, "START.signal");

// --- BACA DARI FILE KONFIGURASI ---
let TARGET_URL = "https://antrigrahadipta.com/"; // Default jika file gagal
try {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    const configData = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    const config = JSON.parse(configData);
    if (config.currentAntamURL) {
      TARGET_URL = config.currentAntamURL;
    }
  }
} catch (e) {
  console.error(`[FATAL] Gagal membaca active_config.json: ${e.message}`);
  process.exit(1);
}
// --- SELESAI BACA ---

const LIVE_SELECTOR = "#name";
const POLLING_INTERVAL_MS = 1500; // 1.5 detik
// ---------------------

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];
let attempt = 0;
let isLive = false;
if (fs.existsSync(SIGNAL_FILE)) {
  fs.unlinkSync(SIGNAL_FILE);
  console.log(`[INFO] Menghapus file sinyal lama: ${SIGNAL_FILE}`);
}
const getRandomUserAgent = () => {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
};
const checkSite = async () => {
  attempt++;
  const userAgent = getRandomUserAgent();
  console.log(
    `[${attempt}] Cek status... (Target: ${LIVE_SELECTOR} di ${TARGET_URL})`
  );
  try {
    const response = await axios.get(TARGET_URL, {
      timeout: 5000,
      headers: { "User-Agent": userAgent, "Cache-Control": "no-cache" },
    });
    const $ = cheerio.load(response.data);
    if ($(LIVE_SELECTOR).length > 0) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        `\n=================================\nFORM SUDAH LIVE! (Selector ${LIVE_SELECTOR} ditemukan)\n=================================\n`
      );
      isLive = true;
      fs.writeFileSync(SIGNAL_FILE, "GO!");
      console.log(`[FIRE!] File sinyal ${SIGNAL_FILE} telah dibuat.`);
    }
  } catch (error) {
    if (error.code === "ECONNABORTED") {
      console.error("\x1b[31m%s\x1b[0m", `[ERROR] Timeout. Server lambat.`);
    } else if (error.response) {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `[ERROR] Status: ${error.response.status} (Server mungkin masih down)`
      );
    } else {
      console.error(
        "\x1b[31m%s\x1b[0m",
        `[ERROR] Gagal konek: ${error.message}`
      );
    }
  }
};
console.clear();
console.log("=================================");
console.log(`🔫 MONITOR "PISTOL START" 🔫`);
console.log("=================================");
console.log(`Menunggu ${LIVE_SELECTOR} di ${TARGET_URL}`);
console.log(
  `Skrip ini akan membuat file '${SIGNAL_FILE}' saat form terdeteksi.`
);
console.log("\nPastikan 'index.js' berjalan di mode 'Siaga' (Menu 2).\n");
const monitorInterval = setInterval(() => {
  if (isLive) {
    clearInterval(monitorInterval);
    console.log("[INFO] Monitor selesai. Tekan Ctrl+C untuk keluar.");
  } else {
    checkSite();
  }
}, POLLING_INTERVAL_MS);

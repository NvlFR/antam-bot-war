// bot/config.js
const path = require("path");
const fs = require("fs");
const logger = require("./logger");

const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const CONFIG_FILE_PATH = path.join(__dirname, "active_config.json"); // <-- File config baru

// --- KONSTANTA (Tidak Berubah) ---
const constants = {
  MOCKUP_FILE_PATH: MOCKUP_FILE,
  SIGNAL_FILE_PATH: path.join(__dirname, "START.signal"),
  SAVE_RESULT_ENDPOINT: `${LARAVEL_API_URL}/bot/save-result`,
  LIST_REGISTRATIONS_ENDPOINT: `${LARAVEL_API_URL}/bot/list-registrations`,
  DATA_DIR: path.join(__dirname, "data"),
  JSON_DIR: path.join(__dirname, "data", "json"),
  CSV_DIR: path.join(__dirname, "data", "csv"),
  USER_DATA_TEMPLATE: {
    name: "IRFAN SURACHMAN",
    nik: "3671110911810002",
    phone_number: "089518744931",
    purchase_date: "2025-10-31",
  },
  MAX_RETRIES: 5,
};

// --- STATE (Sekarang dibaca dari file) ---
let state = {};

try {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    const configData = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    state = JSON.parse(configData);
    logger.info("[CONFIG] Berhasil memuat 'active_config.json'");
  } else {
    logger.warn(
      "[CONFIG] 'active_config.json' tidak ditemukan, gunakan default."
    );
    state = {
      currentAntamURL: "https://antrigrahadipta.com/",
      currentBranch: "BUTIK GRAHA DIPTA",
      currentBranchSelector: "GRAHA DIPTA",
    };
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(state, null, 2));
  }
} catch (e) {
  logger.error(`[CONFIG] Gagal memuat active_config.json: ${e.message}`);
}

// --- FUNGSI BARU: Untuk menyimpan state ---
/**
 * Menyimpan 'state' object saat ini ke 'active_config.json'
 */
function saveState() {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(state, null, 2));
    logger.info("[CONFIG] Konfigurasi baru disimpan ke 'active_config.json'.");
  } catch (e) {
    logger.error(`[CONFIG] Gagal menyimpan konfigurasi: ${e.message}`);
  }
}
// --- SELESAI FUNGSI BARU ---

// --- DAFTAR USER-AGENT (Tidak Berubah) ---
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

// --- Logika Proxy (Tidak Berubah) ---
const PROXY_FILE_PATH = path.join(__dirname, "proxies.json");
let proxyList = [];
try {
  if (fs.existsSync(PROXY_FILE_PATH)) {
    const proxyData = fs.readFileSync(PROXY_FILE_PATH, "utf8");
    if (proxyData.trim() === "" || proxyData.trim() === "[]") {
      proxyList = [];
    } else {
      proxyList = JSON.parse(proxyData);
    }
    if (Array.isArray(proxyList) && proxyList.length > 0) {
      logger.info(
        `[CONFIG] Berhasil memuat ${proxyList.length} proxy dari proxies.json`
      );
    } else {
      logger.warn(
        "[CONFIG] proxies.json ada tapi kosong atau formatnya salah."
      );
      proxyList = [];
    }
  } else {
    logger.warn(
      "[CONFIG] File proxies.json tidak ditemukan. Bot akan berjalan tanpa proxy (menggunakan IP lokal)."
    );
  }
} catch (e) {
  logger.error(`[CONFIG] Gagal memuat proxies.json: ${e.message}`);
  proxyList = [];
}
// --- (Sisa fungsi getRandomProxy, getRandomUserAgent tidak berubah) ---
const getRandomProxy = () => {
  if (proxyList.length === 0) return null;
  const index = Math.floor(Math.random() * proxyList.length);
  logger.info(`[PROXY] Menggunakan proxy ke-${index + 1}`);
  return proxyList[index];
};
const getRandomUserAgent = () => {
  const index = Math.floor(Math.random() * USER_AGENTS.length);
  return USER_AGENTS[index];
};

module.exports = {
  state,
  constants,
  saveState, // <-- Ekspor fungsi baru
  getRandomProxy,
  getRandomUserAgent,
  hasProxies: () => proxyList.length > 0,
};

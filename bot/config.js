// bot/config.js
const path = require("path");
const fs = require("fs");
const logger = require("./logger");

const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";

// --- PERUBAHAN: Pindahkan 'constants' ke atas ---
const constants = {
  MOCKUP_FILE_PATH: MOCKUP_FILE,
  SAVE_RESULT_ENDPOINT: `${LARAVEL_API_URL}/bot/save-result`,
  LIST_REGISTRATIONS_ENDPOINT: `${LARAVEL_API_URL}/bot/list-registrations`,
  DATA_DIR: path.join(__dirname, "data"),
  JSON_DIR: path.join(__dirname, "data", "json"),
  CSV_DIR: path.join(__dirname, "data", "csv"),
  USER_DATA_TEMPLATE: {
    name: "IRFAN SURACHMAN",
    nik: "3671110911810002",
    phone_number: "089518744931",
    branch: "BUTIK GRAHA DIPTA",
    branch_selector: "GRAHA DIPTA",
    purchase_date: "2025-10-31",
  },
  MAX_RETRIES: 5,
};

// --- PERUBAHAN: Tambahkan 'currentBranch' & 'currentBranchSelector' ke 'state' ---
const state = {
  currentAntamURL: "https://antrigrahadipta.com/",
  // Ambil nilai awal dari template
  currentBranch: constants.USER_DATA_TEMPLATE.branch,
  currentBranchSelector: constants.USER_DATA_TEMPLATE.branch_selector,
};
// --- SELESAI PERUBAHAN ---

// --- Logika Proxy (Tidak Berubah) ---
const PROXY_FILE_PATH = path.join(__dirname, "proxies.json");
let proxyList = [];

try {
  if (fs.existsSync(PROXY_FILE_PATH)) {
    const proxyData = fs.readFileSync(PROXY_FILE_PATH, "utf8");
    // --- PERBAIKAN BUG: Pastikan array tidak kosong sebelum parse ---
    if (proxyData.trim() === "") {
      proxyList = [];
    } else if (proxyData.trim() === "[]") {
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

const getRandomProxy = () => {
  if (proxyList.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * proxyList.length);
  logger.info(`[PROXY] Menggunakan proxy ke-${index + 1}`);
  return proxyList[index];
};

module.exports = {
  state,
  constants,
  getRandomProxy,
  hasProxies: () => proxyList.length > 0,
};

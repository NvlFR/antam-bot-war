// bot/config.js
const path = require("path");
const fs = require("fs");
const logger = require("./logger");

const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";
const CONFIG_FILE_PATH = path.join(__dirname, "active_config.json");

const constants = {
  MOCKUP_FILE_PATH: MOCKUP_FILE,
  SIGNAL_FILE_PATH: path.join(__dirname, "START.signal"),
  SAVE_RESULT_ENDPOINT: `${LARAVEL_API_URL}/bot/save-result`,
  LIST_REGISTRATIONS_ENDPOINT: `${LARAVEL_API_URL}/bot/list-registrations`,
  DATA_DIR: path.join(__dirname, "data"),
  JSON_DIR: path.join(__dirname, "data", "json"),
  CSV_DIR: path.join(__dirname, "data", "csv"),
  USER_DATA_TEMPLATE: {
    name: "ASHARI",
    nik: "3175032808880014",
    phone_number: "082125061704",
    purchase_date: "2025-11-06",
  },
  MAX_RETRIES: 8,
};

let state = {};

try {
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    const configData = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    state = JSON.parse(configData);
    logger.info("[CONFIG] Berhasil memuat 'active_config.json'");

    if (
      !state.TWO_CAPTCHA_API_KEY ||
      state.TWO_CAPTCHA_API_KEY === "ISI_KUNCI_API_RAHASIA_ANDA_DI_SINI"
    ) {
      if (state.TWO_CAPTCHA_API_KEY) {
        logger.warn(
          "[CONFIG] TWO_CAPTCHA_API_KEY belum diatur. Fallback ke v3 Gratis."
        );
      }
      state.TWO_CAPTCHA_API_KEY = null;
    } else {
      logger.info("[CONFIG] 2Captcha API Key (Fallback) berhasil dimuat.");
    }

    if (!state.concurrencyLimit) {
      logger.warn(
        "[CONFIG] 'concurrencyLimit' tidak ditemukan, diatur ke default: 1"
      );
      state.concurrencyLimit = 1;
    }
  } else {
    logger.warn(
      "[CONFIG] 'active_config.json' tidak ditemukan, gunakan default."
    );
    state = {
      currentAntamURL: "https://antrigrahadipta.com/",
      currentBranch: "BUTIK GRAHA DIPTA",
      currentBranchSelector: "GRAHA DIPTA",
      TWO_CAPTCHA_API_KEY: null,
      concurrencyLimit: 1,
    };
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(state, null, 2));
  }
} catch (e) {
  logger.error(`[CONFIG] Gagal memuat active_config.json: ${e.message}`);
}

function saveState() {
  try {
    const stateToSave = {
      currentAntamURL: state.currentAntamURL,
      currentBranch: state.currentBranch,
      currentBranchSelector: state.currentBranchSelector,
      TWO_CAPTCHA_API_KEY: state.TWO_CAPTCHA_API_KEY,
      concurrencyLimit: state.concurrencyLimit,
    };
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(stateToSave, null, 2));

    logger.info("[CONFIG] Konfigurasi baru disimpan ke 'active_config.json'.");
  } catch (e) {
    logger.error(`[CONFIG] Gagal menyimpan konfigurasi: ${e.message}`);
  }
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
];

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
  saveState,
  getRandomProxy,
  getRandomUserAgent,
  hasProxies: () => proxyList.length > 0,
};

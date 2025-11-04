// bot/test_koneksi.js
const axios = require("axios");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { URL } = require("url");
const logger = require("./logger");
const chalk = require("chalk");
const { state, getRandomProxy, hasProxies } = require("./config");

(async () => {
  logger.info(chalk.cyan("[TES KONEKSI] Memulai tes koneksi proxy..."));

  if (!hasProxies()) {
    logger.error(
      chalk.redBright("[GAGAL] File 'proxies.json' Anda kosong atau tidak ada.")
    );
    return;
  }

  const proxyString = getRandomProxy();
  if (!proxyString) {
    logger.error(
      chalk.redBright("[GAGAL] Gagal mendapatkan proxy dari config.")
    );
    return;
  }

  const targetURL = state.currentAntamURL;
  if (!targetURL || !targetURL.startsWith("http")) {
    logger.error(
      chalk.redBright(
        `[GAGAL] URL Target di active_config.json tidak valid: ${targetURL}`
      )
    );
    return;
  }

  logger.info(`[TES] Target URL: ${targetURL}`);
  logger.info(`[TES] Menggunakan Gateway: ${proxyString.split("@")[1]}`);

  try {
    const proxyAgent = new HttpsProxyAgent(proxyString);
    const axiosConfig = {
      httpsAgent: proxyAgent,
      httpAgent: proxyAgent,
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    };

    logger.info(`[TES] Menghubungi ${targetURL} melalui proxy...`);
    const response = await axios.get(targetURL, axiosConfig);

    // --- LOGIKA SUKSES YANG DISEMPURNAKAN ---
    if (response.status >= 200 && response.status < 300) {
      logger.info(chalk.greenBright("\n================================="));
      logger.info(chalk.greenBright("[SUKSES] KONEKSI BERHASIL!"));
      logger.info(
        chalk.yellowBright(
          `[STATUS] Server merespons dengan: ${response.status} (${response.statusText})`
        )
      );
      logger.info(chalk.greenBright("=================================\n"));
      logger.info(
        "KESIMPULAN: IP Proxy Anda TIDAK di-blacklist di level jaringan."
      );
    } else {
      // Ini jarang terjadi, tapi untuk status 3xx atau lainnya
      throw new Error(
        `Server merespons dengan status non-200: ${response.status}`
      );
    }
  } catch (err) {
    // --- LOGIKA GAGAL YANG DISEMPURNAKAN ---
    logger.error(chalk.redBright("\n================================="));
    logger.error(chalk.redBright("[GAGAL] KONEKSI GAGAL."));

    if (err.code === "ECONNRESET") {
      logger.error(chalk.redBright("[DETAIL] net::ERR_CONNECTION_RESET"));
      logger.error(
        chalk.yellowBright(
          "KESIMPULAN: IP PROXY ANDA 100% DI-BLACKLIST OLEH FIREWALL SERVER."
        )
      );
    } else if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
      logger.error(`[DETAIL] Koneksi timeout.`);
      logger.error(
        chalk.yellow("KESIMPULAN: Proxy Anda sangat lambat atau mati.")
      );
    } else if (err.response) {
      // (403, 503, dll.)
      logger.error(
        chalk.redBright(
          `[DETAIL] Server merespons dengan error: ${err.response.status}`
        )
      );
      logger.error(
        chalk.yellow(
          "KESIMPULAN: IP Anda TIDAK diblokir, tapi server sedang down (503) atau menolak Anda (403)."
        )
      );
    } else {
      logger.error(`[DETAIL] ${err.message}`);
    }
    logger.error(chalk.redBright("=================================\n"));
  }
})();

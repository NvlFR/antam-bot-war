// bot/bot.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const Captcha = require("2captcha");
const { URL } = require("url"); // <-- Impor URL parser
const logger = require("./logger");
const { sendRegistrationResult } = require("./api");
const { randomDelay, getTodayDateString } = require("./utils");
const {
  state,
  constants,
  getRandomProxy, // <-- Kita butuh ini lagi
  getRandomUserAgent,
} = require("./config");
const chalk = require("chalk");

puppeteer.use(StealthPlugin());

// (Fungsi handleFormFilling TIDAK BERUBAH SAMA SEKALI)
async function handleFormFilling(page, data, antamURL) {
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
  // 3. MENGKLIK CHECKBOX
  logger.info("[INPUT] Clicking KTP agreement checkbox (#check)...");
  await page.click("#check");
  await randomDelay(500, 800);
  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox (#check_2)...");
  await page.click("#check_2");
  await randomDelay(500, 1000);
  // 4. CAPTCHA TEKS
  try {
    const captchaText = await page.$eval("#captcha-box", (el) =>
      el.textContent.trim()
    );
    logger.info(`[CAPTCHA] Text found: ${captchaText}`);
    await page.type("#captcha_input", captchaText, {
      delay: randomDelay(100, 250),
    });
    await randomDelay(1000, 2000);
  } catch (e) {
    logger.warn(
      "[CAPTCHA] Captcha box selector #captcha-box not found. Skipping Captcha input."
    );
  }

  // --- LOGIKA RECAPTCHA (Tidak Berubah) ---
  let solutionToken = null;
  if (state.TWO_CAPTCHA_API_KEY && !antamURL.startsWith("file://")) {
    try {
      logger.warn("[CAPTCHA] Mencoba mengambil reCAPTCHA site-key...");
      const pageHtml = await page.content();
      const siteKeyMatch = pageHtml.match(/grecaptcha.execute\('([^']+)'/);
      if (!siteKeyMatch || !siteKeyMatch[1]) {
        throw new Error("Tidak dapat menemukan reCAPTCHA site-key di halaman.");
      }
      const siteKey = siteKeyMatch[1];
      logger.info(
        `[CAPTCHA] Site-key ditemukan: ${siteKey.substring(0, 10)}...`
      );
      const solver = new Captcha.Solver(state.TWO_CAPTCHA_API_KEY);
      logger.warn(
        "[CAPTCHA] Mengirim permintaan ke 2Captcha... Ini mungkin perlu waktu (15-45 detik)..."
      );
      const res = await solver.recaptcha(siteKey, antamURL);
      solutionToken = res.data;
      logger.info(chalk.greenBright("[CAPTCHA] SOLUSI DITERIMA!"));
    } catch (err) {
      logger.error(
        `[FATAL CAPTCHA] Gagal menyelesaikan reCAPTCHA: ${err.message}`
      );
      return { status: "FAILED_CAPTCHA", ticket_number: null };
    }
  } else if (!antamURL.startsWith("file://")) {
    logger.error(
      "[FATAL CAPTCHA] TWO_CAPTCHA_API_KEY tidak diatur. Tidak bisa melanjutkan."
    );
    return { status: "FAILED_CAPTCHA", ticket_number: null };
  } else {
    logger.info("[MOCKUP] Melewatkan solver reCAPTCHA untuk file mockup.");
  }

  // --- SUBMIT FORM & WAIT (Tidak Berubah) ---
  if (solutionToken) {
    logger.info("[FORM] Memasukkan token reCAPTCHA ke dalam form...");
    await page.evaluate((token) => {
      const recaptchaInput = document.createElement("input");
      recaptchaInput.setAttribute("type", "hidden");
      recaptchaInput.setAttribute("name", "g-recaptcha-response");
      recaptchaInput.setAttribute("value", token);
      document.querySelector("form").appendChild(recaptchaInput);
    }, solutionToken);
    logger.info("[FORM] Mengirim form (submit) secara manual...");
    await page.evaluate(() => {
      document.querySelector("form").submit();
    });
    logger.info("[FORM] Menunggu navigasi halaman baru...");
    await page.waitForNavigation({ timeout: 15000 });
  } else if (antamURL.startsWith("file://")) {
    logger.info("[MOCKUP] Mengklik tombol submit (simulasi)...");
    await page.click('button[type="submit"]');
    logger.info("[MOCKUP] Menunggu delay 5 detik (simulasi)...");
    await randomDelay(5000, 7000);
  }

  logger.info(
    "[FORM] Halaman baru terdeteksi setelah submit. Menganalisis hasil..."
  );

  // 6. DETEKSI HASIL (Tidak berubah)
  let ticketNumber = null;
  try {
    ticketNumber = await page.$eval("#ticket-number-display", (el) =>
      el.textContent.trim()
    );
    logger.info(
      `[RESULT] Success detected using new logic (#ticket-number-display).`
    );
  } catch (e) {
    logger.warn(
      "[RESULT] New logic failed. Falling back to old H4 regex logic..."
    );
    try {
      const successIndicator = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("h4"));
        const successEl = elements.find((el) =>
          el.textContent.includes("Nomor Antrian Anda")
        );
        return successEl ? successEl.textContent : null;
      });
      if (successIndicator) {
        const ticketNumberMatch = successIndicator.match(
          /Nomor Antrian Anda\s*:?\s*([A-Z0-9]+)/i
        );
        if (ticketNumberMatch) {
          ticketNumber = ticketNumberMatch[1].trim();
          logger.info(
            `[RESULT] Success detected using fallback H4 regex logic.`
          );
        }
      }
    } catch (evalError) {
      /* ... */
    }
  }

  if (ticketNumber) {
    return { status: "SUCCESS", ticket_number: ticketNumber };
  } else {
    // ... (Sisa logika deteksi FAILED_STOCK, dll. tidak berubah)
    const genericErrorMessage = await page.$eval("body", (el) => el.innerText);
    if (
      genericErrorMessage.includes("STOK TIDAK TERSEDIA") ||
      genericErrorMessage.includes("stok sudah habis")
    ) {
      logger.error("[RESULT] FAILED: Gagal karena STOK HABIS.");
      return { status: "FAILED_STOCK", ticket_number: null };
    }
    if (genericErrorMessage.includes("NIK sudah terdaftar")) {
      logger.error("[RESULT] FAILED: Gagal karena NIK SUDAH TERDAFTAR.");
      return { status: "FAILED_ALREADY_REGISTERED", ticket_number: null };
    }
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
      logger.error("[RESULT] FAILED: Checkbox error shown...");
      return { status: "FAILED_VALIDATION", ticket_number: null };
    }
    logger.error("[RESULT] FAILED: No success indicator found.");
    return { status: "FAILED_UNKNOWN", ticket_number: null };
  }
}
// --- SELESAI FUNGSI HANDLEFORMFILLING ---

// --- FUNGSI RUNANTAMWAR (Final - Versi Rotasi Proxy + Auth) ---
// --- HAPUS 'browser', HAPUS 'proxyCredentials', TAMBAHKAN 'jobInfo' ---
async function runAntamWar(
  userData,
  antamURL,
  jobInfo = { number: 1, total: 1 }
) {
  let browser;
  let page;

  const now = new Date();
  const localWarTime = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  })
    .format(now)
    .replace(/-/g, "-")
    .replace(" ", " ");

  const todayDate = getTodayDateString();
  userData.purchase_date = todayDate;

  const jobPrefix = `[Job ${jobInfo.number}/${jobInfo.total} | NIK: ${userData.nik}]`;

  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: localWarTime,
  };

  logger.info(chalk.cyanBright(`${jobPrefix} Starting job...`));
  let success = false;
  let attempt = 0;
  const maxRetries = constants.MAX_RETRIES;

  while (attempt < maxRetries && !success) {
    attempt++;
    logger.warn(`${jobPrefix} [RETRY] Attempt ${attempt}/${maxRetries}`);

    try {
      // --- PERUBAHAN BESAR: Logika Proxy & Auth kembali ke sini ---
      const launchOptions = {
        headless: true,
        ignoreHTTPSErrors: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--start-maximized",
          "--ignore-certificate-errors",
          "--allow-running-insecure-content",
        ],
        defaultViewport: null,
      };

      let proxyCredentials = null;
      const proxyString = getRandomProxy(); // Ambil proxy baru setiap attempt

      if (proxyString) {
        try {
          const proxyUrl = new URL(proxyString);
          const proxyServerString = `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`;

          launchOptions.args.push(`--proxy-server=${proxyServerString}`);

          proxyCredentials = {
            username: proxyUrl.username,
            password: proxyUrl.password,
          };

          logger.info(
            `${jobPrefix} [PROXY] Using gateway: ${proxyUrl.hostname}:${proxyUrl.port}`
          );
        } catch (e) {
          logger.error(
            chalk.red(
              `${jobPrefix} [FATAL] Format proxy di 'proxies.json' salah: ${e.message}`
            )
          );
          throw new Error("Proxy format error, stopping job.");
        }
      }

      browser = await puppeteer.launch(launchOptions);
      page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      // Terapkan Autentikasi Proxy
      if (proxyCredentials) {
        logger.info(`${jobPrefix} [PROXY] Authenticating page...`);
        await page.authenticate(proxyCredentials);
      }
      // --- SELESAI PERUBAHAN BESAR ---

      const userAgent = getRandomUserAgent();
      logger.info(
        `${jobPrefix} [CONFIG] Using User-Agent: ${userAgent.substring(
          0,
          40
        )}...`
      );
      await page.setUserAgent(userAgent);

      logger.info(`${jobPrefix} [RETRY] Navigating to ${antamURL}...`);
      await page.goto(antamURL, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      const pageTitle = (await page.title()).toLowerCase();
      const pageContentCheck = (await page.content()).toLowerCase();

      if (
        pageTitle.includes("500 internal server error") ||
        pageTitle.includes("502 bad gateway") ||
        pageTitle.includes("503 service unavailable") ||
        pageTitle.includes("service temporarily unavailable") ||
        pageTitle.includes("error 503") ||
        pageContentCheck.includes("500 internal server error") ||
        pageContentCheck.includes("502 bad gateway") ||
        pageContentCheck.includes("service unavailable")
      ) {
        logger.warn(
          `${jobPrefix} [RETRY] Server returned error page (502/503). Retrying... (Title: ${pageTitle})`
        );
        throw new Error(`Server error page detected: ${pageTitle}`);
      }
      logger.info(
        `${jobPrefix} [RETRY] Page loaded, title OK. Checking for form...`
      );

      logger.info(`${jobPrefix} [RETRY] Waiting for form selector '#name'...`);
      await page.waitForSelector("#name", { timeout: 20000 });
      logger.info(
        `${jobPrefix} [RETRY] Form loaded. Starting filling process...`
      );

      const resultFromForm = await handleFormFilling(page, userData, antamURL);

      const finalPageContent = await page.content();

      registrationResult = {
        ...registrationResult,
        ...resultFromForm,
        raw_response: {
          success_page_content: finalPageContent.substring(0, 500),
        },
      };

      if (registrationResult.status === "SUCCESS") {
        success = true;
      } else {
        if (registrationResult.status === "FAILED_CAPTCHA") {
          logger.error(
            `${jobPrefix} [CRITICAL] Captcha failed, stopping retries.`
          );
          attempt = constants.MAX_RETRIES;
        }
        throw new Error(
          `Form filling failed with status: ${registrationResult.status}`
        );
      }
    } catch (error) {
      logger.error(
        `${jobPrefix} [ATTEMPT ${attempt}] Failed: ${error.message}`
      );

      if (attempt === maxRetries) {
        logger.error(
          `${jobPrefix} [CRITICAL ERROR] Max retries reached. Stopping.`
        );
        if (registrationResult.status === "FAILED") {
          registrationResult.status = "FAILED_MAX_RETRIES";
        }
        registrationResult.raw_response = {
          error: `Max retries reached: ${error.message}`,
        };
      } else {
        logger.info(`${jobPrefix} [RETRY] Waiting 3-5 seconds...`);
        await randomDelay(3000, 5000);
      }
    } finally {
      // --- PERUBAHAN: 'browser' ditutup di sini ---
      if (browser) {
        if (success || attempt >= maxRetries) {
          try {
            await browser.close();
            logger.info(`${jobPrefix} [JOB] Browser closed.`);
          } catch (e) {
            logger.warn(
              `${jobPrefix} [JOB] Failed to close browser, maybe already closed: ${e.message}`
            );
          }
        }
      }
      // --- SELESAI PERUBAHAN ---
    }
  }

  await sendRegistrationResult({ ...userData, ...registrationResult });
  logger.info(chalk.cyanBright(`${jobPrefix} Finished job.`));
  return registrationResult;
}

module.exports = {
  runAntamWar,
};

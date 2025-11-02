// bot/bot.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const Captcha = require("2captcha"); // <-- Diaktifkan
const logger = require("./logger");
const { sendRegistrationResult } = require("./api");
const { randomDelay, getTodayDateString } = require("./utils");
const {
  state, // <-- Kita butuh 'state' untuk API Key
  constants,
  getRandomProxy,
  getRandomUserAgent,
} = require("./config");
const chalk = require("chalk");

puppeteer.use(StealthPlugin());

// --- FUNGSI HANDLEFORMFILLING (DENGAN 2CAPTCHA AKTIF) ---
async function handleFormFilling(page, data, antamURL) {
  logger.info("[FORM] Starting form automation...");

  // 1. (Tidak Berubah) Scroll dan Isi Form
  logger.info("[BEHAVIOUR] Simulating initial scroll...");
  await page.evaluate(() => {
    window.scrollBy(0, 500 + Math.floor(Math.random() * 200));
  });
  await randomDelay(1000, 2000);
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
  logger.info("[INPUT] Clicking KTP agreement checkbox (#check)...");
  await page.click("#check");
  await randomDelay(500, 800);
  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox (#check_2)...");
  await page.click("#check_2");
  await randomDelay(500, 1000);

  // 2. (Tidak Berubah) Isi Captcha Teks (jika ada)
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

  // --- LOGIKA BARU: SOLVE RECAPTCHA ---
  let solutionToken = null;

  // Cek jika API Key ada DAN ini bukan file mockup
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
      solutionToken = res.data; // Ini adalah token solusinya
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
  // --- SELESAI LOGIKA RECAPTCHA ---

  // 5. SUBMIT FORM

  if (solutionToken) {
    // A. JIKA DAPAT TOKEN (LIVE MODE)
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
  } else if (antamURL.startsWith("file://")) {
    // B. JIKA INI MOCKUP FILE
    logger.info("[MOCKUP] Mengklik tombol submit (simulasi)...");
    await page.click('button[type="submit"]');
  }

  // Tunggu halaman baru setelah submit
  await page.waitForNavigation({ timeout: 15000 });
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

// --- FUNGSI RUNANTAMWAR (Final) ---
async function runAntamWar(userData, antamURL) {
  // Hapus flag 'isSemiAuto'
  let browser;
  let page;

  const now = new Date();
  const localWarTime = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Jakarta",
  })
    .format(now)
    .replace(/-/g, "-")
    .replace(" ", " ");
  const todayDate = getTodayDateString();
  userData.purchase_date = todayDate;
  logger.info(`[DATE] War date set to: ${userData.purchase_date}`);

  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: localWarTime,
  };

  logger.info(`[JOB] Starting job for NIK: ${userData.nik}`);
  let success = false;
  let attempt = 0;

  // Selalu gunakan MAX_RETRIES dari config
  const maxRetries = constants.MAX_RETRIES;

  while (attempt < maxRetries && !success) {
    attempt++;
    logger.warn(
      `[RETRY] Attempt ${attempt}/${maxRetries} for NIK: ${userData.nik}`
    );

    try {
      const launchOptions = {
        headless: true, // Selalu headless (otomatis)
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

      const proxy = getRandomProxy();
      if (proxy) {
        launchOptions.args.push(`--proxy-server=${proxy}`);
      }

      browser = await puppeteer.launch(launchOptions);
      page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      const userAgent = getRandomUserAgent();
      logger.info(
        `[CONFIG] Using User-Agent: ${userAgent.substring(0, 40)}...`
      );
      await page.setUserAgent(userAgent);

      logger.info(`[RETRY] Navigating to ${antamURL}...`);
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
          `[RETRY] Server returned error page (502/503). Retrying... (Title: ${pageTitle})`
        );
        throw new Error(`Server error page detected: ${pageTitle}`);
      }
      logger.info("[RETRY] Page loaded, title OK. Checking for form...");

      logger.info("[RETRY] Waiting for form selector '#name'...");
      await page.waitForSelector("#name", { timeout: 20000 });
      logger.info("[RETRY] Form loaded. Starting filling process...");

      // Kirim 'antamURL' ke handleFormFilling untuk solver
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
            "[CRITICAL] Captcha failed, stopping retries for this NIK."
          );
          attempt = constants.MAX_RETRIES; // Paksa loop berhenti
        }
        throw new Error(
          `Form filling failed with status: ${registrationResult.status}`
        );
      }
    } catch (error) {
      logger.error(
        `[ATTEMPT ${attempt}] Failed to load form or complete filling for NIK ${userData.nik}: ${error.message}`
      );

      if (attempt === maxRetries) {
        logger.error(
          `[CRITICAL ERROR] Max retries reached for NIK ${userData.nik}. Stopping.`
        );
        if (registrationResult.status === "FAILED") {
          registrationResult.status = "FAILED_MAX_RETRIES";
        }
        registrationResult.raw_response = {
          error: `Max retries reached: ${error.message}`,
        };
      } else {
        logger.info("[RETRY] Waiting 3-5 seconds before next attempt...");
        await randomDelay(3000, 5000);
      }
    } finally {
      if (browser) {
        if (success || attempt >= maxRetries) {
          try {
            await browser.close();
            logger.info(`[JOB] Browser closed for NIK: ${userData.nik}`);
          } catch (e) {
            logger.warn(
              `[JOB] Failed to close browser, maybe already closed: ${e.message}`
            );
          }
        }
      }
    }
  }

  await sendRegistrationResult({ ...userData, ...registrationResult });
  logger.info(`[JOB] Finished job for NIK: ${userData.nik}`);
  return registrationResult;
}

module.exports = {
  runAntamWar,
};

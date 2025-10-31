// bot/bot.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const logger = require("./logger");
const { sendRegistrationResult } = require("./api");
const { randomDelay, getTodayDateString } = require("./utils");
const { constants } = require("./config");

puppeteer.use(StealthPlugin());

async function handleFormFilling(page, data) {
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

  // 3. MENGKLIK CHECKBOX PERSETUJUAN
  logger.info("[INPUT] Clicking KTP agreement checkbox (#check)...");
  await page.click("#check");
  await randomDelay(500, 800);

  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox (#check_2)...");
  await page.click("#check_2");
  await randomDelay(500, 1000);

  // 4. MEMBACA DAN MENGISI CAPTCHA TEKS
  logger.info("[CAPTCHA] Reading static Captcha text...");
  let captchaText = "";
  try {
    captchaText = await page.$eval("#captcha-box", (el) =>
      el.textContent.trim()
    );
    logger.info(`[CAPTCHA] Text found: ${captchaText}`);

    logger.info("[CAPTCHA] Typing Captcha answer...");
    await page.type("#captcha_input", captchaText, {
      delay: randomDelay(100, 250),
    });
    await randomDelay(1000, 2000);
  } catch (e) {
    logger.warn(
      "[CAPTCHA] Captcha box selector #captcha-box not found. Skipping Captcha input."
    );
  }

  // 5. SUBMIT FORM
  logger.info("[FORM] Clicking submit button...");
  await page.click('button[type="submit"]');

  await randomDelay(5000, 7000);

  // 6. DETEKSI HASIL
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
      logger.error(
        `[RESULT] Fallback H4 logic also failed: ${evalError.message}`
      );
    }
  }

  if (ticketNumber) {
    return {
      status: "SUCCESS",
      ticket_number: ticketNumber,
    };
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
      logger.error(
        "[RESULT] FAILED: Checkbox error shown or Captcha/NIK/Phone is wrong."
      );
      return { status: "FAILED_VALIDATION", ticket_number: null };
    }

    logger.error(
      "[RESULT] FAILED: No success indicator found. Probably server overload/error or form not submitted."
    );
    return { status: "FAILED_UNKNOWN", ticket_number: null };
  }
}

async function runAntamWar(userData, antamURL) {
  let browser;
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
  logger.info(`[DATE] War date set to: ${userData.purchase_date}`);

  let registrationResult = {
    status: "FAILED",
    ticket_number: null,
    raw_response: {},
    war_time: localWarTime,
  };

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

  logger.info(`[JOB] Starting job for NIK: ${userData.nik}`);
  let success = false;
  let attempt = 0;

  while (attempt < constants.MAX_RETRIES && !success) {
    attempt++;
    logger.warn(
      `[RETRY] Attempt ${attempt}/${constants.MAX_RETRIES} for NIK: ${userData.nik}`
    );

    try {
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 768 });

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      );

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

      const resultFromForm = await handleFormFilling(page, userData);
      const finalPageContent = await page.content();

      registrationResult = {
        ...registrationResult,
        ...resultFromForm,
        raw_response: {
          success_page_content: finalPageContent.substring(0, 500),
        },
      };

      success = true;
    } catch (error) {
      logger.error(
        `[ATTEMPT ${attempt}] Failed to load form or complete filling for NIK ${userData.nik}: ${error.message}`
      );

      if (attempt === constants.MAX_RETRIES) {
        logger.error(
          `[CRITICAL ERROR] Max retries reached for NIK ${userData.nik}. Stopping.`
        );
        registrationResult.status = "FAILED";
        registrationResult.raw_response = {
          error: `Max retries reached: ${error.message}`,
        };
      } else {
        logger.info("[RETRY] Waiting 3-5 seconds before next attempt...");
        await randomDelay(3000, 5000);
      }
    } finally {
      if (browser) {
        if (success || attempt === constants.MAX_RETRIES) {
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

// antam-bot-war/bot/index.js (di dalam fungsi handleFormFilling)

async function handleFormFilling(page, data) {
  logger.info("[FORM] Starting form automation...");

  // 1. SCROLL ALAMI (Tetap)
  // ...

  // 2. MENGISI INPUT DENGAN DELAY ALAMI (Koreksi ID di sini)

  // NAMA KTP: dari #nama menjadi #name
  logger.info(`[INPUT] Typing Name: ${data.name}`);
  await page.type("#name", data.name, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  // NIK: dari #nik menjadi #ktp
  logger.info(`[INPUT] Typing NIK: ${data.nik}`);
  await page.type("#ktp", data.nik, { delay: randomDelay(50, 150) });
  await randomDelay(300, 700);

  // NOMOR HP: dari #no_hp menjadi #phone_number
  logger.info(`[INPUT] Typing Phone: ${data.phone_number}`);
  await page.type("#phone_number", data.phone_number, {
    delay: randomDelay(50, 150),
  });
  await randomDelay(300, 700);

  // 3. MENGKLIK CHECKBOX PERSETUJUAN (Koreksi ID di sini)

  // Checkbox 1: dari #ktp_agreement menjadi #check
  logger.info("[INPUT] Clicking KTP agreement checkbox (#check)...");
  await page.click("#check");
  await randomDelay(500, 800);

  // Checkbox 2: dari #stock_agreement menjadi #check_2
  logger.info("[INPUT] Clicking Stock/Trade agreement checkbox (#check_2)...");
  await page.click("#check_2");
  await randomDelay(500, 1000);

  // 4. MEMBACA DAN MENGISI CAPTCHA TEKS (Koreksi ID Baca)

  // Teks Captcha: dari #captcha_text menjadi #captcha-box
  logger.info("[CAPTCHA] Reading static Captcha text...");
  const captchaText = await page.$eval("#captcha-box", (el) =>
    el.textContent.trim()
  ); // Tambahkan .trim() untuk memastikan tidak ada spasi ekstra
  logger.info(`[CAPTCHA] Text found: ${captchaText}`);

  // Input Captcha: ID tetap #captcha_input
  logger.info("[CAPTCHA] Typing Captcha answer...");
  await page.type("#captcha_input", captchaText, {
    delay: randomDelay(100, 250),
  });
  await randomDelay(1000, 2000);

  // 5. SUBMIT FORM (Selector tombol submit)
  logger.info("[FORM] Clicking submit button...");
  // Di form ini tidak ada ID, jadi kita gunakan selector CSS: button[type="submit"]
  await page.click('button[type="submit"]');
  await randomDelay(2000, 3000);

  // ... (lanjutkan dengan deteksi hasil)
}

// bot/cli.js
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const prompt = require("prompt-sync")({ sigint: true });
const logger = require("./logger");
const boxen = require("boxen").default;
const gradient = require("gradient-string").default;
const figlet = require("figlet");
const chalk = require("chalk");

// --- PERUBAHAN BARU: Impor puppeteer di CLI ---
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
// --- SELESAI PERUBAHAN ---

// Impor modul yang sudah kita pecah
const { state, constants } = require("./config");
const { randomDelay } = require("./utils");
const { displayStatus } = require("./api");
const { runAntamWar } = require("./bot"); // runAntamWar sekarang lebih pintar

// --- PERUBAHAN: 'runAllJobsInParallel' sekarang menerima browser ---
async function runAllJobsInParallel(userList, browser) {
  logger.info(
    `[PARALLEL] Starting ${userList.length} jobs concurrently using shared browser...`
  );

  const tasks = userList.map((userData) => {
    // Pass browser yang sudah ada ke setiap job
    return runAntamWar(userData, state.currentAntamURL, browser).catch((e) => {
      logger.error(
        `[FATAL PARALLEL] Job for NIK ${userData.nik} failed unexpectedly: ${e.message}`
      );
      return { status: "FAILED_CRITICAL", nik: userData.nik };
    });
  });

  await Promise.all(tasks);
  logger.info("[PARALLEL] All concurrent jobs completed.");
}

// --- PERUBAHAN: 'scheduleAntamWar' sekarang mengelola browser pool ---
async function scheduleAntamWar(userList, targetHour, targetMinute, dataMode) {
  const now = new Date();
  const targetTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    targetHour,
    targetMinute,
    0,
    0
  );

  let timeUntilTarget = targetTime.getTime() - now.getTime();

  if (timeUntilTarget < 0) {
    logger.error("=================================================");
    logger.error(
      `[SCHEDULING] Waktu target ${targetHour
        .toString()
        .padStart(2, "0")}:${targetMinute
        .toString()
        .padStart(2, "0")}:00 WIB sudah lewat.`
    );
    logger.error("Waktu target harus di hari ini dan belum terlewat.");
    logger.error("=================================================");
    return;
  }

  // (Logika countdown tidak berubah)
  const hours = Math.floor(timeUntilTarget / (1000 * 60 * 60));
  const minutes = Math.floor(
    (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
  );
  const seconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);
  logger.warn("=================================================");
  logger.warn(`[SCHEDULING] Mode ${dataMode} (PARALEL) dipilih.`);
  logger.warn(`[SCHEDULING] Total NIK: ${userList.length}`);
  logger.warn(`[SCHEDULING] URL Tujuan: ${state.currentAntamURL}`);
  logger.warn(
    `[SCHEDULING] Bot akan dieksekusi tepat pada: ${targetTime.toLocaleTimeString(
      "id-ID",
      { hour12: false }
    )} WIB`
  );
  logger.warn(
    `[COUNTDOWN] Waktu tersisa: ${hours} jam, ${minutes} menit, ${seconds} detik.`
  );
  logger.warn("JANGAN TUTUP TERMINAL INI. Bot dalam mode SIAGA!");
  logger.warn("=================================================");
  const countdownInterval = setInterval(() => {
    timeUntilTarget -= 1000;
    const currentSeconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);
    const currentMinutes = Math.floor(
      (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
    );
    if (timeUntilTarget > 60000 && currentSeconds % 10 === 0) {
      logger.info(
        `[COUNTDOWN] Waktu tersisa: ${currentMinutes} menit, ${currentSeconds} detik.`
      );
    } else if (timeUntilTarget <= 60000 && timeUntilTarget > 0) {
      logger.warn(
        `[COUNTDOWN] Waktu tersisa: ${currentMinutes} menit, ${currentSeconds} detik. SIAP!`
      );
    }
    if (timeUntilTarget < 1000) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  // --- LOGIKA BROWSER POOL DIMULAI ---
  let browser;
  try {
    // 1. Tentukan launchOptions di sini
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

    // 2. Luncurkan SATU browser untuk semua job
    logger.info("[BROWSER POOL] Meluncurkan browser bersama...");
    browser = await puppeteer.launch(launchOptions);
    logger.info(
      "[BROWSER POOL] Browser bersama berhasil diluncurkan. Menunggu jadwal..."
    );

    // 3. Jalankan timer
    await new Promise((resolve) =>
      setTimeout(() => {
        logger.info("=================================================");
        logger.info(
          `[SCHEDULING] WAKTU EKSEKUSI TEPAT ${targetHour
            .toString()
            .padStart(2, "0")}:${targetMinute
            .toString()
            .padStart(2, "0")}:00! Menjalankan Antam War Paralel...`
        );
        logger.info("=================================================");
        // 4. Kirim browser yang sudah hidup ke semua job
        resolve(runAllJobsInParallel(userList, browser));
      }, timeUntilTarget)
    );

    logger.info("[SCHEDULING] Selesai mengeksekusi semua job.");
  } catch (err) {
    logger.error(`[BROWSER POOL] Gagal meluncurkan browser: ${err.message}`);
  } finally {
    // 5. Setelah SEMUA selesai, tutup browser
    if (browser) {
      await browser.close();
      logger.info(
        "[BROWSER POOL] Semua job paralel selesai. Browser bersama ditutup."
      );
    }
  }
  // --- LOGIKA BROWSER POOL SELESAI ---
}

// --- FUNGSI MENU (Tidak ada perubahan di bawah ini) ---

async function processManualInput() {
  logger.info("\n--- MODE INPUT MANUAL ---");

  const name = prompt("Masukkan Nama: ");
  let nik;
  do {
    nik = prompt("Masukkan NIK (16 digit): ");
    if (nik.trim().length !== 16 || isNaN(nik.trim())) {
      logger.error(
        "[VALIDASI] NIK harus tepat 16 digit dan berupa angka. Coba lagi."
      );
    }
  } while (nik.trim().length !== 16 || isNaN(nik.trim()));

  let phone_number;
  do {
    phone_number = prompt("Masukkan No. HP (diawali 08xx): ");
    if (!phone_number.trim().startsWith("08") || isNaN(phone_number.trim())) {
      logger.error(
        "[VALIDASI] Nomor HP harus diawali '08' dan berupa angka. Coba lagi."
      );
    }
  } while (!phone_number.trim().startsWith("08") || isNaN(phone_number.trim()));

  const branch = prompt("Masukkan Nama Cabang (ex: BUTIK EMAS GRAHA CIPTA): ");
  const branch_selector = prompt(
    "Masukkan Selector Cabang (ex: GRAHA CIPTA): "
  );

  const userData = {
    ...constants.USER_DATA_TEMPLATE,
    name,
    nik: nik.trim(),
    phone_number: phone_number.trim(),
    branch,
    branch_selector,
  };

  logger.info(`[MANUAL] Starting single job for NIK: ${userData.nik}`);
  // Ini akan otomatis menggunakan `existingBrowser = null`
  // dan `runAntamWar` akan meluncurkan/menutup browser-nya sendiri.
  await runAntamWar(userData, state.currentAntamURL);
}

async function processUserData() {
  logger.info("\n--- INPUT JSON FILE ---");
  if (!fs.existsSync(constants.JSON_DIR)) {
    logger.error(
      `[FATAL] Folder JSON tidak ditemukan: ${constants.JSON_DIR}. Silakan buat folder ini.`
    );
    return;
  }

  const jsonFiles = fs
    .readdirSync(constants.JSON_DIR)
    .filter((file) => file.endsWith(".json"));
  if (jsonFiles.length === 0) {
    logger.error(
      `[FATAL] Tidak ada file .json ditemukan di folder: ${constants.JSON_DIR}`
    );
    return;
  }

  console.log(chalk.yellowBright("\nAvailable JSON Files:"));
  jsonFiles.forEach((file, index) => {
    console.log(chalk.cyanBright(`${index + 1}.`) + ` ${file}`);
  });

  let choiceIndex;
  do {
    const choice = prompt(`Pilih nomor file (1-${jsonFiles.length}): `);
    choiceIndex = parseInt(choice.trim()) - 1;
    if (
      choiceIndex < 0 ||
      choiceIndex >= jsonFiles.length ||
      isNaN(choiceIndex)
    ) {
      logger.error("[VALIDASI] Pilihan tidak valid.");
    }
  } while (
    choiceIndex < 0 ||
    choiceIndex >= jsonFiles.length ||
    isNaN(choiceIndex)
  );

  const selectedFile = jsonFiles[choiceIndex];
  const dataFilePath = path.join(constants.JSON_DIR, selectedFile);
  logger.info(`[CLI] Reading user data from: ${dataFilePath}`);

  let rawData;
  try {
    rawData = fs.readFileSync(dataFilePath);
  } catch (e) {
    logger.error(`[FATAL] Could not read data file: ${e.message}`);
    return;
  }

  let userListRaw;
  try {
    userListRaw = JSON.parse(rawData);
  } catch (e) {
    logger.error(`[FATAL] Failed to parse JSON data: ${e.message}`);
    return;
  }

  if (!Array.isArray(userListRaw) || userListRaw.length === 0) {
    logger.error("[FATAL] Data file must contain a non-empty array of users.");
    return;
  }

  const userList = userListRaw.map((userEntry) => ({
    ...constants.USER_DATA_TEMPLATE,
    name: userEntry.nama || userEntry.name,
    nik: userEntry.nik,
    phone_number: userEntry.telepon || userEntry.phone_number,
    branch: userEntry.branch || constants.USER_DATA_TEMPLATE.branch,
    branch_selector:
      userEntry.branch_selector || constants.USER_DATA_TEMPLATE.branch_selector,
  }));

  let targetHour, targetMinute;
  do {
    const timeInput = prompt("Masukkan JAM War (HH:MM, contoh 07:00): ");
    const parts = timeInput.split(":");
    if (
      parts.length === 2 &&
      !isNaN(parseInt(parts[0])) &&
      !isNaN(parseInt(parts[1]))
    ) {
      targetHour = parseInt(parts[0]);
      targetMinute = parseInt(parts[1]);
      if (
        targetHour >= 0 &&
        targetHour <= 23 &&
        targetMinute >= 0 &&
        targetMinute <= 59
      ) {
        break;
      }
    }
    logger.error("[VALIDASI] Format jam tidak valid. Gunakan format HH:MM.");
  } while (true);

  await scheduleAntamWar(
    userList,
    targetHour,
    targetMinute,
    `JSON File: ${selectedFile}`
  );

  logger.info("[CLI] All JSON user jobs completed (after scheduling).");
}

async function processCSVData() {
  logger.info("\n--- INPUT CSV FILE ---");
  if (!fs.existsSync(constants.CSV_DIR)) {
    logger.error(
      `[FATAL] Folder CSV tidak ditemukan: ${constants.CSV_DIR}. Silakan buat folder ini.`
    );
    return;
  }

  const csvFiles = fs
    .readdirSync(constants.CSV_DIR)
    .filter((file) => file.endsWith(".csv"));
  if (csvFiles.length === 0) {
    logger.error(
      `[FATAL] Tidak ada file .csv ditemukan di folder: ${constants.CSV_DIR}`
    );
    return;
  }

  console.log(chalk.yellowBright("\nAvailable CSV Files:"));
  csvFiles.forEach((file, index) => {
    console.log(chalk.cyanBright(`${index + 1}.`) + ` ${file}`);
  });

  let choiceIndex;
  do {
    const choice = prompt(`Pilih nomor file (1-${csvFiles.length}): `);
    choiceIndex = parseInt(choice.trim()) - 1;
    if (
      choiceIndex < 0 ||
      choiceIndex >= csvFiles.length ||
      isNaN(choiceIndex)
    ) {
      logger.error("[VALIDASI] Pilihan tidak valid.");
    }
  } while (
    choiceIndex < 0 ||
    choiceIndex >= csvFiles.length ||
    isNaN(choiceIndex)
  );

  const selectedFile = csvFiles[choiceIndex];
  const dataFilePath = path.join(constants.CSV_DIR, selectedFile);
  logger.info(`[CLI] Reading user data from CSV: ${dataFilePath}`);

  const userList = await new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(dataFilePath)) {
      logger.error(`[FATAL] File not found: ${dataFilePath}`);
      return resolve([]);
    }
    fs.createReadStream(dataFilePath)
      .pipe(csv())
      .on("data", (data) => {
        const userData = {
          ...constants.USER_DATA_TEMPLATE,
          ...data,
          name: data.name || data.nama,
          nik: data.nik,
          phone_number: data.phone_number || data.telepon,
          branch: data.branch || constants.USER_DATA_TEMPLATE.branch,
          branch_selector:
            data.branch_selector ||
            constants.USER_DATA_TEMPLATE.branch_selector,
        };
        results.push(userData);
      })
      .on("end", () => {
        logger.info(
          `[CLI] Successfully parsed ${results.length} records from CSV.`
        );
        resolve(results);
      })
      .on("error", (err) => {
        logger.error(`[FATAL] Error reading CSV file: ${err.message}`);
        reject(err);
      });
  });

  if (!Array.isArray(userList) || userList.length === 0) {
    logger.error("[FATAL] CSV file is empty or could not be processed.");
    return;
  }

  let targetHour, targetMinute;
  do {
    const timeInput = prompt("Masukkan JAM War (HH:MM, contoh 07:00): ");
    const parts = timeInput.split(":");
    if (
      parts.length === 2 &&
      !isNaN(parseInt(parts[0])) &&
      !isNaN(parseInt(parts[1]))
    ) {
      targetHour = parseInt(parts[0]);
      targetMinute = parseInt(parts[1]);
      if (
        targetHour >= 0 &&
        targetHour <= 23 &&
        targetMinute >= 0 &&
        targetMinute <= 59
      ) {
        break;
      }
    }
    logger.error("[VALIDASI] Format jam tidak valid. Gunakan format HH:MM.");
  } while (true);

  await scheduleAntamWar(
    userList,
    targetHour,
    targetMinute,
    `CSV File: ${selectedFile}`
  );
  logger.info("[CLI] All CSV user jobs completed (after scheduling).");
}

function setAntamURL() {
  logger.info("\n--- PILIH BUTIK ANTAM ---");
  const butikOptions = [
    "https://antrigrahadipta.com/",
    "https://antributikserpong.com/",
    "https://antributikbintaro.com/",
    "http://127.0.0.1:9090/",
    "http://127.0.0.1:9090/500",
    "http://127.0.0.1:9090/503",
    "http://127.0.0.1:9090/slow",
    `file://${constants.MOCKUP_FILE_PATH}`,
    "Custom URL",
  ];

  butikOptions.forEach((url, index) => {
    const displayUrl = url.startsWith("file://")
      ? "MOCKUP FILE (Local HTML)"
      : url;
    console.log(`${index + 1}. ${displayUrl}`);
  });

  console.log(`\nURL Aktif Saat Ini: ${state.currentAntamURL}`);
  const choice = prompt("Pilih nomor butik atau masukkan URL baru: ");
  const numChoice = parseInt(choice.trim());

  if (numChoice >= 1 && numChoice <= butikOptions.length) {
    state.currentAntamURL = butikOptions[numChoice - 1];
    if (state.currentAntamURL === "Custom URL") {
      const customUrl = prompt(
        "Masukkan URL kustom (harus diawali http/https): "
      );
      state.currentAntamURL = customUrl.trim();
    }
  } else if (
    choice.trim().toLowerCase().startsWith("http") ||
    choice.trim().toLowerCase().startsWith("file://")
  ) {
    state.currentAntamURL = choice.trim();
  } else {
    logger.error("[ERROR] Pilihan atau format URL tidak valid.");
  }
  logger.info(`[CONFIG] URL tujuan diatur ke: ${state.currentAntamURL}`);
}

async function showBanner() {
  return new Promise((resolve, reject) => {
    figlet.text(
      "ANTAM BOT WAR",
      {
        font: "ANSI Shadow",
        horizontalLayout: "default",
        verticalLayout: "default",
      },
      (err, data) => {
        if (err) return reject(err);
        console.clear();
        const banner = gradient("cyan", "yellow").multiline(data);
        const subtitle = gradient(
          "yellow",
          "green"
        )("AUTOMATED REGISTRATION BOT");
        const box = boxen(`${banner}\n${subtitle}`, {
          padding: 1,
          borderStyle: "round",
          borderColor: "yellow",
          align: "center",
        });
        console.log(chalk.yellowBright(box));
        resolve();
      }
    );
  });
}

async function displayMainMenu() {
  let continueLoop = true;
  while (continueLoop) {
    const titleBox = boxen("✨ ANTAM BOT WAR MENU ✨", {
      padding: 1,
      margin: 1,
      borderStyle: "double",
      borderColor: "cyan",
      align: "center",
    });
    console.log(chalk.cyanBright(titleBox));
    console.log(
      chalk.yellow(
        boxen("Pilih Mode Eksekusi:", {
          padding: 0.5,
          borderColor: "yellow",
          borderStyle: "round",
        })
      )
    );
    console.log(
      chalk.cyanBright("1.") +
        " 🧍 Manual Input (1 NIK)  — " +
        chalk.greenBright("EKSEKUSI SEKARANG")
    );
    console.log(
      chalk.cyanBright("2.") +
        " 🧾 Input JSON File       — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(
      chalk.cyanBright("3.") +
        " 📄 Input CSV File        — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(chalk.cyanBright("4.") + " 📋 Show Registration Status");
    console.log(
      chalk.cyanBright("5.") +
        " 🏢 Ganti Butik (Active URL): " +
        chalk.magentaBright(state.currentAntamURL)
    );
    console.log(chalk.cyanBright("6.") + " 🚪 Exit");
    console.log(
      gradient("yellow", "green")("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    );
    const choice = prompt(chalk.bold("Pilih menu (1-6): "));
    console.log(gradient("cyan", "magenta")("\n⏳ Memproses pilihanmu...\n"));
    await randomDelay(500, 1200);

    switch (choice.trim()) {
      case "1":
        await processManualInput();
        break;
      case "2":
        await processUserData();
        break;
      case "3":
        await processCSVData();
        break;
      case "4":
        await displayStatus();
        break;
      case "5":
        setAntamURL();
        break;
      case "6":
        console.log(
          gradient(
            "red",
            "yellow"
          )("\n👋 Terima kasih telah menggunakan ANTAM BOT WAR!")
        );
        continueLoop = false;
        break;
      default:
        console.log(chalk.redBright("[!] Pilihan tidak valid, coba lagi."));
    }
    if (continueLoop) {
      console.log(
        gradient("yellow", "green")("\nTekan ENTER untuk kembali...")
      );
      prompt("");
    }
  }
}

module.exports = {
  displayMainMenu,
  showBanner,
};

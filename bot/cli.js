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
const pLimit = require("p-limit").default;

const { state, constants, getRandomProxy, hasProxies } = require("./config");
const { randomDelay } = require("./utils");
const { displayStatus } = require("./api");
const { runAntamWar } = require("./bot");

// --- PERUBAHAN: Sesuaikan limit Anda di sini ---
const limit = pLimit(1); // Gunakan '1' untuk strategi IP HP

async function runAllJobsInParallel(userList) {
  logger.info(
    `[PARALLEL] Starting ${userList.length} jobs with a concurrency limit of 1...`
  );

  const tasks = userList.map((userData) => {
    return limit(() => runAntamWar(userData, state.currentAntamURL)).catch(
      (e) => {
        logger.error(
          `[FATAL PARALLEL] Job for NIK ${userData.nik} failed unexpectedly: ${e.message}`
        );
        return { status: "FAILED_CRITICAL", nik: userData.nik };
      }
    );
  });

  await Promise.all(tasks);
  logger.info("[PARALLEL] All concurrent jobs completed.");
}

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

  const hours = Math.floor(timeUntilTarget / (1000 * 60 * 60));
  const minutes = Math.floor(
    (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
  );
  const seconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);
  logger.warn("=================================================");
  logger.warn(`[SCHEDULING] Mode ${dataMode} (PARALEL) dipilih.`);
  logger.warn(`[SCHEDULING] Total NIK: ${userList.length}`);
  logger.warn(`[SCHEDULING] URL Tujuan: ${state.currentAntamURL}`);

  // --- PERUBAHAN: Tampilkan juga branch default ---
  logger.warn(`[SCHEDULING] Cabang Default: ${state.currentBranch}`);
  // --- SELESAI PERUBAHAN ---

  if (hasProxies()) {
    logger.warn(
      `[SCHEDULING] Rotasi Proxy AKTIF. Menggunakan ${
        constants.MAX_RETRIES
      } proxy per NIK (total ${
        userList.length * constants.MAX_RETRIES
      } percobaan).`
    );
  } else {
    logger.warn(
      "[SCHEDULING] Rotasi Proxy TIDAK AKTIF (proxies.json tidak ditemukan). Menggunakan IP lokal."
    );
  }

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
      resolve(runAllJobsInParallel(userList));
    }, timeUntilTarget)
  );

  logger.info("[SCHEDULING] Selesai mengeksekusi semua job.");
}

// --- FUNGSI MENU ---

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

  // Di mode manual, kita tetap bertanya. Kita tidak pakai default dari state.
  const branch = prompt(
    `Masukkan Nama Cabang (default: ${state.currentBranch}): `
  );
  const branch_selector = prompt(
    `Masukkan Selector Cabang (default: ${state.currentBranchSelector}): `
  );

  const userData = {
    ...constants.USER_DATA_TEMPLATE,
    name,
    nik: nik.trim(),
    phone_number: phone_number.trim(),
    // Gunakan input manual, JIKA KOSONG, baru pakai state
    branch: branch || state.currentBranch,
    branch_selector: branch_selector || state.currentBranchSelector,
  };

  logger.info(`[MANUAL] Starting single job for NIK: ${userData.nik}`);
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
    // --- PERUBAHAN: Gunakan 'state' sebagai fallback ---
    branch: userEntry.branch || state.currentBranch,
    branch_selector: userEntry.branch_selector || state.currentBranchSelector,
    // --- SELESAI PERUBAHAN ---
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
          // --- PERUBAHAN: Gunakan 'state' sebagai fallback ---
          branch: data.branch || state.currentBranch,
          branch_selector: data.branch_selector || state.currentBranchSelector,
          // --- SELESAI PERUBAHAN ---
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
  logger.info("\n--- PILIH BUTIK ANTAM (URL) ---");
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

// --- PERUBAHAN: Fungsi baru untuk ganti branch ---
function setBranch() {
  logger.info("\n--- PENGATURAN CABANG (BRANCH) ---");
  console.log(chalk.yellow(`Cabang Default Saat Ini: ${state.currentBranch}`));
  console.log(
    chalk.yellow(`Selector Default Saat Ini: ${state.currentBranchSelector}`)
  );

  const newBranch = prompt(
    "Masukkan Nama Cabang BARU (ex: BUTIK EMAS GRAHA DIPTA): "
  );
  const newSelector = prompt(
    "Masukkan Selector Cabang BARU (ex: GRAHA DIPTA): "
  );

  if (
    newBranch &&
    newBranch.trim() !== "" &&
    newSelector &&
    newSelector.trim() !== ""
  ) {
    state.currentBranch = newBranch.trim();
    state.currentBranchSelector = newSelector.trim();
    logger.info(
      chalk.greenBright(
        `[CONFIG] Cabang default diatur ke: ${state.currentBranch}`
      )
    );
  } else {
    logger.warn("[CONFIG] Input tidak valid. Pengaturan cabang tidak diubah.");
  }
}
// --- SELESAI PERUBAHAN ---

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

// --- PERUBAHAN: Memperbarui Menu Utama ---
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

    // Menampilkan status konfigurasi saat ini
    const statusBox = boxen(
      chalk.yellow("KONFIGURASI SAAT INI:\n") +
        `URL Target : ${chalk.magentaBright(state.currentAntamURL)}\n` +
        `Cabang     : ${chalk.magentaBright(state.currentBranch)}\n` +
        `Selector   : ${chalk.magentaBright(state.currentBranchSelector)}`,
      {
        padding: 0.5,
        borderColor: "gray",
        borderStyle: "round",
        dimBorder: true,
      }
    );
    console.log(statusBox);

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
    console.log(chalk.cyanBright("4.") + " 📋 Tampilkan Status Registrasi");
    console.log(chalk.cyanBright("5.") + " 🏢 Ganti Butik (URL Target)");
    console.log(chalk.cyanBright("6.") + " ⚙️ Ganti Cabang (Branch Default)"); // <-- MENU BARU
    console.log(chalk.cyanBright("7.") + " 🚪 Keluar"); // <-- Exit jadi 7
    console.log(
      gradient("yellow", "green")("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    );
    const choice = prompt(chalk.bold("Pilih menu (1-7): "));
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
      case "6": // <-- CASE BARU
        setBranch();
        break;
      case "7": // <-- Exit jadi 7
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
// --- SELESAI PERUBAHAN ---

module.exports = {
  displayMainMenu,
  showBanner,
};

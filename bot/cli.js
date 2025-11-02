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

// --- HAPUS PUPPETEER DARI SINI ---

const {
  state,
  constants,
  saveState,
  getRandomProxy,
  hasProxies,
} = require("./config");
const { randomDelay } = require("./utils");
const { displayStatus } = require("./api");
const { runAntamWar } = require("./bot");

// --- PERUBAHAN BESAR: Sesuaikan limit dengan jumlah proxy Anda ---
// Jika Anda punya 10 proxy, atur ke 10. Jika 50, atur ke 50.
// Jangan lebih tinggi dari jumlah proxy Anda.
const limit = pLimit(10);
// --- SELESAI PERUBAHAN ---

async function runAllJobsInParallel(userList) {
  logger.info(
    `[PARALLEL] Starting ${userList.length} jobs with a concurrency limit of 10...`
  );

  const tasks = userList.map((userData) => {
    // Panggil runAntamWar (mode otomatis)
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
    logger.error("[SCHEDULING] Waktu target sudah lewat.");
    logger.error("=================================================");
    return;
  }

  const hours = Math.floor(timeUntilTarget / (1000 * 60 * 60));
  const minutes = Math.floor(
    (timeUntilTarget % (1000 * 60 * 60)) / (1000 * 60)
  );
  const seconds = Math.floor((timeUntilTarget % (1000 * 60)) / 1000);
  logger.warn("=================================================");
  logger.warn(`[SCHEDULING] Mode ${dataMode} (TIMER) dipilih.`);
  logger.warn(`[SCHEDULING] Total NIK: ${userList.length}`);
  logger.warn(`[SCHEDULING] URL Tujuan: ${state.currentAntamURL}`);
  logger.warn(`[SCHEDULING] Cabang Default: ${state.currentBranch}`);
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
      logger.info("[SCHEDULING] WAKTU EKSEKUSI TEPAT! Menjalankan War...");
      logger.info("=================================================");
      resolve(runAllJobsInParallel(userList));
    }, timeUntilTarget)
  );

  logger.info("[SCHEDULING] Selesai mengeksekusi semua job.");
}

async function loadDataAndGetList(dataType) {
  const FOLDER_PATH =
    dataType === "json" ? constants.JSON_DIR : constants.CSV_DIR;
  const FILE_EXT = dataType === "json" ? ".json" : ".csv";

  if (!fs.existsSync(FOLDER_PATH)) {
    logger.error(
      `[FATAL] Folder ${dataType.toUpperCase()} tidak ditemukan: ${FOLDER_PATH}.`
    );
    return null;
  }

  const files = fs
    .readdirSync(FOLDER_PATH)
    .filter((file) => file.endsWith(FILE_EXT));
  if (files.length === 0) {
    logger.error(
      `[FATAL] Tidak ada file ${FILE_EXT} ditemukan di folder: ${FOLDER_PATH}`
    );
    return null;
  }

  console.log(
    chalk.yellowBright(`\nAvailable ${dataType.toUpperCase()} Files:`)
  );
  files.forEach((file, index) => {
    console.log(chalk.cyanBright(`${index + 1}.`) + ` ${file}`);
  });

  let choiceIndex;
  do {
    const choice = prompt(`Pilih nomor file (1-${files.length}): `);
    choiceIndex = parseInt(choice.trim()) - 1;
    if (choiceIndex < 0 || choiceIndex >= files.length || isNaN(choiceIndex)) {
      logger.error("[VALIDASI] Pilihan tidak valid.");
    }
  } while (
    choiceIndex < 0 ||
    choiceIndex >= files.length ||
    isNaN(choiceIndex)
  );

  const selectedFile = files[choiceIndex];
  const dataFilePath = path.join(FOLDER_PATH, selectedFile);
  logger.info(`[CLI] Reading user data from: ${dataFilePath}`);

  let userList;

  if (dataType === "json") {
    try {
      const rawData = fs.readFileSync(dataFilePath);
      const userListRaw = JSON.parse(rawData);
      if (!Array.isArray(userListRaw) || userListRaw.length === 0) {
        logger.error("[FATAL] Data file must contain a non-empty array.");
        return null;
      }
      userList = userListRaw.map((userEntry) => ({
        ...constants.USER_DATA_TEMPLATE,
        name: userEntry.nama || userEntry.name,
        nik: userEntry.nik,
        phone_number: userEntry.telepon || userEntry.phone_number,
        branch: userEntry.branch || state.currentBranch,
        branch_selector:
          userEntry.branch_selector || state.currentBranchSelector,
      }));
    } catch (e) {
      logger.error(`[FATAL] Gagal memproses JSON: ${e.message}`);
      return null;
    }
  } else {
    // Logika CSV
    userList = await new Promise((resolve) => {
      const results = [];
      fs.createReadStream(dataFilePath)
        .pipe(csv())
        .on("data", (data) => {
          results.push({
            ...constants.USER_DATA_TEMPLATE,
            ...data,
            name: data.name || data.nama,
            nik: data.nik,
            phone_number: data.phone_number || data.telepon,
            branch: data.branch || state.currentBranch,
            branch_selector:
              data.branch_selector || state.currentBranchSelector,
          });
        })
        .on("end", () => {
          if (results.length === 0) {
            logger.error("[FATAL] CSV file is empty.");
            resolve(null);
          }
          resolve(results);
        })
        .on("error", (err) => {
          logger.error(`[FATAL] Error reading CSV file: ${err.message}`);
          resolve(null);
        });
    });
  }

  return { userList, selectedFile };
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
    branch: branch || state.currentBranch,
    branch_selector: branch_selector || state.currentBranchSelector,
  };
  logger.info(`[MANUAL] Starting single job for NIK: ${userData.nik}`);

  // Kirim 'false' (otomatis) untuk mode manual
  await runAntamWar(userData, state.currentAntamURL, false);
}

async function processUserData() {
  logger.info("\n--- INPUT JSON FILE (TIMER) ---");
  const data = await loadDataAndGetList("json");
  if (!data) return;
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
    data.userList,
    targetHour,
    targetMinute,
    `JSON File: ${data.selectedFile}`
  );
}
async function processCSVData() {
  logger.info("\n--- INPUT CSV FILE (TIMER) ---");
  const data = await loadDataAndGetList("csv");
  if (!data) return;
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
    data.userList,
    targetHour,
    targetMinute,
    `CSV File: ${data.selectedFile}`
  );
}

async function processDataWithMonitor() {
  logger.info("\n--- SIAGA (TUNGGU SINYAL MONITOR) ---");
  console.log("Pilih file data yang ingin disiagakan:");
  const dataType = prompt("Ketik 'json' or 'csv': ").toLowerCase();
  let data;
  if (dataType === "json") {
    data = await loadDataAndGetList("json");
  } else if (dataType === "csv") {
    data = await loadDataAndGetList("csv");
  } else {
    logger.error("Pilihan tidak valid.");
    return;
  }
  if (!data) return;
  if (fs.existsSync(constants.SIGNAL_FILE_PATH)) {
    fs.unlinkSync(constants.SIGNAL_FILE_PATH);
  }
  logger.warn("=================================================");
  logger.warn("🤖 BOT DALAM MODE SIAGA 🤖");
  logger.warn(`Total NIK disiagakan: ${data.userList.length}`);
  logger.warn(
    `Menunggu sinyal dari 'monitor.js' di file: ${constants.SIGNAL_FILE_PATH}`
  );
  logger.warn(
    "Pastikan Anda menjalankan 'node bot/monitor.js' di terminal lain."
  );
  logger.warn("=================================================");
  let watcher;
  const signalPromise = new Promise((resolve) => {
    watcher = fs.watch(__dirname, (eventType, filename) => {
      if (filename === path.basename(constants.SIGNAL_FILE_PATH)) {
        logger.info(
          chalk.greenBright(
            "\n[PISTOL START!] Sinyal terdeteksi! Menjalankan War..."
          )
        );
        resolve();
      }
    });
  });
  await signalPromise;
  watcher.close();
  if (fs.existsSync(constants.SIGNAL_FILE_PATH)) {
    fs.unlinkSync(constants.SIGNAL_FILE_PATH);
  }
  await runAllJobsInParallel(data.userList);
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

  saveState();
}

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
    saveState();
  } else {
    logger.warn("[CONFIG] Input tidak valid. Pengaturan cabang tidak diubah.");
  }
}

// --- HAPUS FUNGSI 'toggleRunMode' ---

async function showBanner() {
  return new Promise((resolve, reject) => {
    figlet.text("ANTAM BOT WAR", { font: "ANSI Shadow" }, (err, data) => {
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
    });
  });
}

// --- PERUBAHAN: TAMPILAN MENU UTAMA (Final) ---
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

    // Mode selalu otomatis
    const modeText = chalk.greenBright("OTOMATIS (Full Bot)");

    const statusBox = boxen(
      chalk.yellow("KONFIGURASI SAAT INI:\n") +
        `URL Target : ${chalk.magentaBright(state.currentAntamURL)}\n` +
        `Cabang     : ${chalk.magentaBright(state.currentBranch)}\n` +
        `Selector   : ${chalk.magentaBright(state.currentBranchSelector)}\n` +
        `Mode       : ${modeText}`, // <-- Selalu Otomatis
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
        " 🧍 Manual Input (1 NIK)         — " +
        chalk.greenBright("EKSEKUSI SEKARANG")
    );
    console.log(
      chalk.cyanBright("2.") +
        " 🔫 Siaga (Tunggu Sinyal)        — " +
        chalk.redBright("MODE PERANG UTAMA")
    );
    console.log(
      chalk.cyanBright("3.") +
        " 🧾 Input JSON File (Timer)      — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(
      chalk.cyanBright("4.") +
        " 📄 Input CSV File (Timer)       — " +
        chalk.yellowBright("JADWALKAN WAKTU")
    );
    console.log(chalk.cyanBright("5.") + " 📋 Tampilkan Status Registrasi");
    console.log(chalk.cyanBright("6.") + " 🏢 Ganti Butik (URL Target)");
    console.log(chalk.cyanBright("7.") + " ⚙️ Ganti Cabang (Branch Default)");
    console.log(chalk.cyanBright("8.") + " 🚪 Keluar"); // <-- Exit jadi 8

    console.log(
      gradient("yellow", "green")("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    );
    const choice = prompt(chalk.bold("Pilih menu (1-8): "));
    console.log(gradient("cyan", "magenta")("\n⏳ Memproses pilihanmu...\n"));
    await randomDelay(500, 1200);

    switch (choice.trim()) {
      case "1":
        await processManualInput();
        break;
      case "2":
        await processDataWithMonitor();
        break;
      case "3":
        await processUserData();
        break;
      case "4":
        await processCSVData();
        break;
      case "5":
        await displayStatus();
        break;
      case "6":
        setAntamURL();
        break;
      case "7":
        setBranch();
        break;
      case "8": // <-- Exit jadi 8
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

const axios = require("axios");
const logger = require("./logger");
const chalk = require("chalk");
const Table = require("cli-table3");
const { constants } = require("./config");

async function sendRegistrationResult(data) {
  try {
    const response = await axios.post(constants.SAVE_RESULT_ENDPOINT, data);
    logger.info(
      "[SUCCESS] Result sent to Laravel. ID:",
      response.data.registration_id
    );
  } catch (error) {
    logger.error(
      "[FATAL] Failed to send result to Laravel. Check DB/Validation."
    );

    if (error.response) {
      logger.error(`Status API: ${error.response.status}`);

      if (
        error.response.status === 422 &&
        error.response.data.errors &&
        error.response.data.errors.nik
      ) {
        logger.error(
          `[NIK WARNING] NIK ${data.nik} ditolak API (422: sudah terdaftar). Mengirim ulang data sebagai RIWAYAT GAGAL.`
        );

        const historyData = {
          ...data,
          nik_history: data.nik,
          nik: "HISTORY_" + data.nik,
          name: data.name + " (HISTORY)",
          status: "FAILED_HISTORY",
        };

        delete historyData.nik_history;

        try {
          const historyResponse = await axios.post(
            constants.SAVE_RESULT_ENDPOINT,
            historyData
          );
          logger.info(
            "[SUCCESS] Result sent to Laravel as HISTORY. ID:",
            historyResponse.data.registration_id
          );
        } catch (e) {
          logger.error(
            "[FATAL] Gagal menyimpan riwayat NIK ke Laravel (meski sudah diganti key)."
          );
          logger.error(`Error details: ${e.message}`);
        }
      } else {
        if (error.response.data && error.response.data.errors) {
          logger.error(
            "Validation Errors:",
            JSON.stringify(error.response.data.errors, null, 2)
          );
        } else {
          logger.error(
            "API Error Response:",
            JSON.stringify(error.response.data, null, 2)
          );
        }
      }
    } else {
      logger.error(`Error details: ${error.message}`);
    }
  }
}

async function displayStatus() {
  logger.info("\n--- STATUS PENDAFTARAN ---");

  try {
    const response = await axios.get(constants.LIST_REGISTRATIONS_ENDPOINT);
    const rawData = response.data.data;

    if (rawData.length === 0) {
      logger.info("Database pendaftaran masih kosong.");
      return;
    }

    const successful = rawData.filter((item) => item.status === "SUCCESS");
    const failedHistory = rawData.filter(
      (item) =>
        item.status.includes("FAILED") || item.status.includes("BLOCKED")
    );
    const pending = rawData.filter((item) => item.status === "PENDING");

    const printTable = (dataList, title, colorFunc) => {
      if (dataList.length === 0) {
        console.log(colorFunc(`\n[ ${title} ] - Tidak ada data.`));
        return;
      }

      console.log(
        colorFunc(`\n================================================`)
      );
      console.log(colorFunc(`[ ${title} ] - Total: ${dataList.length} Entri`));
      console.log(
        colorFunc(`================================================`)
      );

      const table = new Table({
        head: ["Waktu Daftar", "NIK", "Nama", "Cabang", "Status", "No. Tiket"],
        colWidths: [18, 18, 15, 18, 20, 12],
        style: {
          head: [colorFunc.name],
        },
      });

      dataList.forEach((item) => {
        const time = item.created_at.substring(5, 16).replace("T", " ");
        const name = item.name.substring(0, 14);
        const branch = item.branch.split(" ").pop().substring(0, 10);
        const ticketText = item.ticket_number || "-";

        let statusText;
        if (item.status === "SUCCESS") {
          statusText = chalk.greenBright(`BERHASIL ✅`);
        } else if (item.status === "PENDING") {
          statusText = chalk.yellow(`PENDING ⏳`);
        } else if (item.status === "FAILED_CRITICAL") {
          statusText = chalk.bgRed.white(`KRITIS ❌`);
        } else if (item.status === "FAILED_HISTORY") {
          statusText = chalk.red(`RIWAYAT GAGAL 🛑`);
        } else {
          statusText = chalk.red(`GAGAL (${item.status}) ❌`);
        }

        table.push([time, item.nik, name, branch, statusText, ticketText]);
      });

      console.log(table.toString());
    };

    printTable(successful, "STATUS BERHASIL (SUCCESS)", chalk.greenBright);
    printTable(
      failedHistory,
      "STATUS GAGAL & RIWAYAT (FAILED/HISTORY/BLOCKED)",
      chalk.redBright
    );
    printTable(pending, "STATUS TERTUNDA (PENDING)", chalk.yellow);
  } catch (error) {
    logger.error(
      "[FATAL] Gagal mengambil data dari Laravel API. Pastikan 'php artisan serve' berjalan."
    );
    if (error.response) {
      logger.error(`Status API: ${error.response.status}`);
    } else {
      logger.error(`Error details: ${error.message}`);
    }
  }
}

module.exports = {
  sendRegistrationResult,
  displayStatus,
};

// bot/logger.js
const winston = require("winston");
const path = require("path");
// --- PERUBAHAN 1: Ubah nama impor ---
const DailyRotateFile = require("winston-daily-rotate-file");
// --- SELESAI PERUBAHAN ---

// Definisikan format log (Tidak berubah)
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  )
);

// Konfigurasi Logger
const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    // 1. Console Transport (Tidak berubah)
    new winston.transports.Console({
      format: winston.format.colorize({ all: true }),
    }),

    // --- PERUBAHAN 2: Ganti nama constructor ---
    // 2. File Transport untuk Error
    new DailyRotateFile({
      filename: path.join(__dirname, "logs", "bot-error-%DATE%.log"),
      level: "error",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "14d",
    }),

    // 3. File Transport Gabungan
    new DailyRotateFile({
      filename: path.join(__dirname, "logs", "bot-combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "14d",
    }),
    // --- SELESAI PERUBAHAN ---
  ],
});

module.exports = logger;

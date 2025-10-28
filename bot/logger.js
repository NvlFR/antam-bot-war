const winston = require("winston");
const path = require("path");

// Definisikan format log
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  )
);

// Konfigurasi Logger
const logger = winston.createLogger({
  level: "info", // Level log minimum yang akan dicatat
  format: logFormat,
  transports: [
    // 1. Console Transport (Output ke terminal)
    new winston.transports.Console({
      format: winston.format.colorize({ all: true }),
    }),

    // 2. File Transport (Output ke file log)
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "bot-error.log"),
      level: "error", // Hanya log level error
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "logs", "bot-combined.log"), // Semua log
    }),
  ],
});

module.exports = logger;

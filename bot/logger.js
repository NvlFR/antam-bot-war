const winston = require("winston");
const path = require("path");
const DailyRotateFile = require("winston-daily-rotate-file");
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  )
);

const logger = winston.createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.colorize({ all: true }),
    }),

    new DailyRotateFile({
      filename: path.join(__dirname, "logs", "bot-error-%DATE%.log"),
      level: "error",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "14d",
    }),

    new DailyRotateFile({
      filename: path.join(__dirname, "logs", "bot-combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxFiles: "14d",
    }),
  ],
});

module.exports = logger;

// bot/config.js
const path = require("path");

const MOCKUP_FILE = path.join(__dirname, "mockup_form.html");
const LARAVEL_API_URL = "http://127.0.0.1:8000/api";

// Objek untuk menyimpan state yang bisa berubah
const state = {
  currentAntamURL: "https://antrigrahadipta.com/",
};

const constants = {
  MOCKUP_FILE_PATH: MOCKUP_FILE,
  SAVE_RESULT_ENDPOINT: `${LARAVEL_API_URL}/bot/save-result`,
  LIST_REGISTRATIONS_ENDPOINT: `${LARAVEL_API_URL}/bot/list-registrations`,
  DATA_DIR: path.join(__dirname, "data"),
  JSON_DIR: path.join(__dirname, "data", "json"),
  CSV_DIR: path.join(__dirname, "data", "csv"),
  USER_DATA_TEMPLATE: {
    name: "IRFAN SURACHMAN",
    nik: "3671110911810002",
    phone_number: "089518744931",
    branch: "BUTIK GRAHA DIPTA",
    branch_selector: "GRAHA DIPTA",
    purchase_date: "2025-10-31",
  },
  MAX_RETRIES: 5,
};

module.exports = {
  state,
  constants,
};

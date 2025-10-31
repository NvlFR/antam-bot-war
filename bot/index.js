// bot/index.js
const { showBanner, displayMainMenu } = require("./cli");

// --- EKSEKUSI UTAMA ---
(async () => {
  await showBanner(); // tampilkan banner dulu
  await displayMainMenu(); // lalu tampilkan menu
})();

const { showBanner, displayMainMenu } = require("./cli");

(async () => {
  await showBanner(); 
  await displayMainMenu();
})();

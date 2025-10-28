// antam-bot-war/wa-worker/server.js
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  PHONENUMBER_MCC,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeInMemoryStore,
  jidDecode,
  proto,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const { pino } = require("pino");
const express = require("express");
const qrcode = require("qrcode-terminal");
const app = express();
const port = 3000;
// Gunakan Pino Logger untuk Baileys
const logger = pino({ level: "info" }).child({ level: "info" });

app.use(express.json());

let sock = null; // WhatsApp socket instance

// --- KONEKSI BAILEYS ---
async function connectToWhatsApp() {
  logger.info("Initializing Baileys connection...");

  // Gunakan 'baileys_auth_info' untuk menyimpan sesi
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

  sock = makeWASocket({
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ["Laravel WA Notifier", "Safari", "3.0"],
  });

  sock.ev.on("creds.update", saveCreds);

sock.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect, qr } = update;

  if (qr) {
    console.log("🔹 Scan QR ini pakai WhatsApp kamu:");
    qrcode.generate(qr, { small: true });
  }

  if (connection === "close") {
    const shouldReconnect =
      lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
    logger.info("Connection closed. Should reconnect:", shouldReconnect);
    if (shouldReconnect) connectToWhatsApp();
  } else if (connection === "open") {
    logger.info("✅ WhatsApp connection opened successfully!");
  }
});

}

// --- API ENDPOINT UNTUK LARAVEL ---
app.post("/send-message", async (req, res) => {
  const { to, message } = req.body;

  if (!sock || !sock.user) {
    return res
      .status(503)
      .json({
        success: false,
        message: "WhatsApp Service Unreachable. Please scan QR code.",
      });
  }

  if (!to || !message) {
    return res
      .status(400)
      .json({ success: false, message: 'Missing "to" or "message" field.' });
  }

  // Konversi nomor telepon (08xxx) menjadi JID WhatsApp (628xxx@s.whatsapp.net)
  let jid = to.replace(/[^0-9]/g, ""); // Hapus semua non-digit
  if (jid.startsWith("0")) {
    jid = "62" + jid.substring(1); // Ubah 08xx menjadi 628xx
  }
  jid += "@s.whatsapp.net";

  try {
    await sock.sendMessage(jid, { text: message });
    logger.info(`Message sent to ${to}`);
    res.json({ success: true, message: `Message sent to ${to}` });
  } catch (e) {
    logger.error(`Failed to send message to ${to}: ${e.message}`);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to send WhatsApp message.",
        error: e.message,
      });
  }
});

// --- JALANKAN SERVER ---
connectToWhatsApp()
  .then(() => {
    app.listen(port, () => {
      logger.info(`WhatsApp API Gateway running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to start WhatsApp Worker:", err);
  });

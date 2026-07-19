// Persistent action log. Console output disappears when the control app
// window is closed; this file survives between sessions so you can check
// after a stream whether something failed silently.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'logs', 'bot.log');

function ensureLogDir() {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(level, category, message) {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] [${level}] [${category}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (err) {
    console.error(`[logger] Failed to write to ${LOG_PATH}: ${err.message}`);
  }
}

// action(): records something the bot attempted to do -- a command run,
// a mod action taken, an alert fired, a connection attempt -- along with
// whether it actually succeeded, so failures are never silent.
function action(category, message, ok = true) {
  write(ok ? 'OK' : 'FAIL', category, message);
}

function info(category, message) {
  write('INFO', category, message);
}

function error(category, message) {
  write('ERROR', category, message);
}

module.exports = { action, info, error, LOG_PATH };

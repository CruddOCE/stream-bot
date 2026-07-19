const fs = require('fs');
const path = require('path');

const CONFIG_DIR = process.env.STREAM_BOT_CONFIG_DIR || path.join(__dirname, '..', 'config');

const FILES = {
  commands: 'commands.json',
  moderation: 'moderation.json',
};

const state = {};
const listeners = { commands: [], moderation: [] };
const watchers = [];

function loadFile(key) {
  const filePath = path.join(CONFIG_DIR, FILES[key]);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    state[key] = JSON.parse(raw);
  } catch (err) {
    console.error(`[config] Failed to load ${FILES[key]}: ${err.message}`);
    if (!state[key]) state[key] = key === 'commands' ? {} : { enabled: false };
  }
}

function watchFile(key) {
  const filePath = path.join(CONFIG_DIR, FILES[key]);
  let debounce = null;
  const watcher = fs.watch(filePath, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      loadFile(key);
      console.log(`[config] Reloaded ${FILES[key]}`);
      listeners[key].forEach((cb) => cb(state[key]));
    }, 150);
  });
  // A watched file can briefly disappear (e.g. an editor's save-via-rename),
  // which otherwise crashes the process with an unhandled 'error' event.
  watcher.on('error', (err) => console.error(`[config] Watcher error on ${FILES[key]}: ${err.message}`));
  watchers.push(watcher);
}

function init() {
  Object.keys(FILES).forEach((key) => {
    loadFile(key);
    watchFile(key);
  });
}

function close() {
  watchers.forEach((w) => w.close());
  watchers.length = 0;
}

function get(key) {
  return state[key];
}

function onChange(key, cb) {
  listeners[key].push(cb);
}

module.exports = { init, get, onChange, close };

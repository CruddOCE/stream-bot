// Small in-memory runtime state shared across modules. Cleared on restart.

const lastRaider = {};

function setLastRaider(platform, username) {
  lastRaider[platform] = username;
}

function getLastRaider(platform) {
  return lastRaider[platform] || null;
}

module.exports = { setLastRaider, getLastRaider };

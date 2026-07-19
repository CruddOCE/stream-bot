const { exec } = require('child_process');

function openUrl(url) {
  const opener =
    process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} "${url}"`, () => {});
}

module.exports = { openUrl };

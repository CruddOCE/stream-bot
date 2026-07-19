// Interactive uninstaller. Removes installed dependencies (node_modules)
// and, if you choose, your saved credentials (.env). Never touches your
// source code, custom commands/jokes/moderation config, or git history --
// those are yours, not install artifacts.

const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const rl = readline.createInterface({ input: stdin, output: stdout });

async function confirm(question, defaultYes = false) {
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = (await rl.question(`${question} ${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

function removePath(relPath) {
  const full = path.join(ROOT, relPath);
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`Removed ${relPath}`);
  } else {
    console.log(`${relPath} not found, nothing to remove.`);
  }
}

// Best-effort: find node.exe processes whose command line points at this
// project folder (e.g. "node index.js" run from here), so we can offer to
// stop them before deleting node_modules out from under a live process.
function findRunningBotProcesses() {
  if (process.platform !== 'win32') return [];
  const psScript = `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains([System.IO.Path]::GetFullPath('${ROOT.replace(/'/g, "''")}')) } | Select-Object -ExpandProperty ProcessId`;
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
      encoding: 'utf8',
      timeout: 10000,
    });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l))
      .map(Number);
  } catch (err) {
    console.warn('Could not check for running bot processes:', err.message);
    return [];
  }
}

function killProcesses(pids) {
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore' });
      console.log(`Stopped process ${pid}.`);
    } catch (err) {
      console.warn(`Could not stop process ${pid}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('stream-bot uninstaller');
  console.log('Removes installed dependencies and, if you choose, your saved credentials.');
  console.log('Your source code, custom commands/jokes/moderation settings, and git history are never touched.\n');

  const running = findRunningBotProcesses();
  if (running.length > 0) {
    console.log(`Found ${running.length} running bot process(es): ${running.join(', ')}`);
    const stop = await confirm('Stop them now so files can be removed cleanly?', true);
    if (stop) {
      killProcesses(running);
    } else {
      console.log('Leaving them running -- some files may fail to delete while in use.');
    }
  }

  const removeDeps = await confirm(
    '\nRemove installed dependencies (node_modules)? Safe -- reinstall anytime with npm install or the installer.',
    true
  );
  if (removeDeps) removePath('node_modules');

  const removeEnv = await confirm(
    '\nRemove your saved credentials (.env)? This deletes your Twitch/YouTube tokens -- you will need to redo the setup wizard next time.',
    false
  );
  if (removeEnv) removePath('.env');

  console.log('\nDone.');
  console.log('Your project files (source code, config/*.json, README) were left in place.');
  console.log('To remove the project entirely, delete this folder yourself, and delete the GitHub repo yourself if you no longer want it there.');
  rl.close();
}

main().catch((err) => {
  console.error('Uninstall failed:', err);
  rl.close();
  process.exit(1);
});

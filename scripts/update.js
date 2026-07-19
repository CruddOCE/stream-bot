// Updates this install to the latest version pushed to GitHub. Stashes
// any local edits first (e.g. your customized config/*.json), pulls,
// then reapplies those edits -- your customizations are preserved, or on
// a genuine conflict, left for you to resolve rather than silently lost.
// Then reinstalls dependencies in case package.json changed.
//
// Usage: node scripts/update.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const logger = require('../src/logger');

const ROOT = path.join(__dirname, '..');

function resolveExe(candidates, fallback) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return fallback;
}

function resolveGit() {
  return resolveExe(['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe'], 'git');
}

function resolveNpm() {
  return resolveExe(['C:\\Program Files\\nodejs\\npm.cmd', 'C:\\Program Files (x86)\\nodejs\\npm.cmd'], 'npm');
}

function run(cmd, args) {
  console.log(`> ${path.basename(cmd)} ${args.join(' ')}`);
  return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
}

function main() {
  const git = resolveGit();

  console.log('Checking for local changes...');
  let status;
  try {
    status = run(git, ['status', '--porcelain']).trim();
  } catch (err) {
    console.error('FAILED: this does not look like a git checkout, or git is not available.');
    console.error(err.message);
    logger.action('update', `git status failed: ${err.message}`, false);
    process.exitCode = 1;
    return;
  }
  const hasLocalChanges = status.length > 0;

  if (hasLocalChanges) {
    console.log('Local changes found (likely your custom config/*.json) -- stashing them so they are not lost...');
    try {
      run(git, ['stash', 'push', '-u', '-m', 'stream-bot auto-update']);
    } catch (err) {
      console.error('FAILED to stash local changes:', err.message);
      logger.action('update', `Stash failed: ${err.message}`, false);
      process.exitCode = 1;
      return;
    }
  }

  console.log('Pulling latest changes from GitHub...');
  try {
    console.log(run(git, ['pull', '--ff-only']));
  } catch (err) {
    console.error('FAILED to pull:', err.message);
    logger.action('update', `git pull failed: ${err.message}`, false);
    if (hasLocalChanges) {
      console.log('Restoring your local changes...');
      try {
        run(git, ['stash', 'pop']);
      } catch (e) {
        console.error('Also failed to restore your stashed local changes -- run `git stash list` to find them:', e.message);
      }
    }
    process.exitCode = 1;
    return;
  }

  if (hasLocalChanges) {
    console.log('Reapplying your local changes...');
    try {
      run(git, ['stash', 'pop']);
    } catch (err) {
      console.error('Your local changes conflict with the update. Nothing was lost -- run `git status` to resolve manually.');
      console.error(err.message);
      logger.action('update', `Stash pop conflict: ${err.message}`, false);
      process.exitCode = 1;
      return;
    }
  }

  console.log('Installing any new dependencies...');
  try {
    run(resolveNpm(), ['install']);
  } catch (err) {
    console.error('npm install failed:', err.message);
    logger.action('update', `npm install failed: ${err.message}`, false);
    process.exitCode = 1;
    return;
  }

  console.log('SUCCESS: Update complete.');
  console.log('If install-stream-bot.exe, uninstall-stream-bot.exe, or stream-bot-control.exe changed, close and reopen this app to use the new version.');
  logger.action('update', 'Update completed successfully');
}

main();

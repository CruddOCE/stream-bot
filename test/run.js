// Offline smoke test — exercises config loading, commands, and the
// moderation engine without needing any real Twitch/YouTube credentials
// or network access. Run with: npm test

process.env.BOT_PREFIX = '!';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point the config store at a scratch copy so this test never touches
// the real config/ files.
const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-bot-test-'));
fs.mkdirSync(path.join(scratchDir, 'config'));
fs.copyFileSync(path.join(__dirname, '..', 'config', 'commands.json'), path.join(scratchDir, 'config', 'commands.json'));
fs.copyFileSync(path.join(__dirname, '..', 'config', 'jokes.json'), path.join(scratchDir, 'config', 'jokes.json'));
fs.copyFileSync(path.join(__dirname, '..', 'config', 'alerts.json'), path.join(scratchDir, 'config', 'alerts.json'));
fs.writeFileSync(
  path.join(scratchDir, 'config', 'moderation.json'),
  JSON.stringify({
    enabled: true,
    bannedWords: ['badword'],
    linkFilter: { enabled: true, action: 'delete', allowlist: ['clips.twitch.tv'] },
    capsFilter: { enabled: true, minLength: 10, maxCapsRatio: 0.7, action: 'warn' },
    spamFilter: { enabled: true, repeatedMessageThreshold: 3, windowSeconds: 30, action: 'timeout', timeoutSeconds: 60 },
    warnBeforeTimeout: true,
    maxWarnings: 2,
    escalatedTimeoutSeconds: 300,
  })
);

process.env.STREAM_BOT_CONFIG_DIR = path.join(scratchDir, 'config');
const configStore = require('../src/configStore');
configStore.init();

const commands = require('../src/commands');
const moderation = require('../src/moderation');
const state = require('../src/state');

// The batch installer previously broke because it had Unix-style LF-only
// line endings, which cmd.exe's parser handles unreliably (it silently
// fragments and misexecutes parts of the script, especially around CALLing
// other batch files like npm.cmd). Catch that regression here instead of
// discovering it by double-clicking a broken installer.
function checkBatchFileLineEndings() {
  const root = path.join(__dirname, '..');
  const batFiles = fs.readdirSync(root).filter((f) => f.endsWith('.bat'));
  assert.ok(batFiles.length > 0, 'expected at least one .bat file to check');
  for (const file of batFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const hasLoneLF = /(?<!\r)\n/.test(text);
    assert.ok(!hasLoneLF, `${file} has LF-only line endings somewhere — must be CRLF throughout for cmd.exe to parse it reliably`);
  }
  console.log(`batch file line endings (${batFiles.join(', ')}): ok`);
}

async function run() {
  checkBatchFileLineEndings();

  // --- Commands ---
  let replied = '';
  const ctx = { reply: (msg) => { replied = msg; } };

  let handled = await commands.handle({ text: '!hello', username: 'viewer1' }, ctx);
  assert.strictEqual(handled, true);
  assert.strictEqual(replied, 'Hey there, welcome to the stream!');
  console.log('custom command (!hello): ok');

  handled = await commands.handle({ text: '!uptime', username: 'viewer1' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(replied.includes('Bot has been running for'));
  console.log('builtin command (!uptime): ok');

  handled = await commands.handle({ text: 'no prefix here', username: 'viewer1' }, ctx);
  assert.strictEqual(handled, false);
  console.log('non-command message ignored: ok');

  const jokesList = JSON.parse(fs.readFileSync(path.join(scratchDir, 'config', 'jokes.json'), 'utf8'));
  handled = await commands.handle({ text: '!joke', username: 'viewer1' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(jokesList.includes(replied), 'joke reply should come from config/jokes.json');
  console.log('builtin command (!joke): ok');

  handled = await commands.handle({ text: '!pp', username: 'weeb123', displayName: 'CoolViewer' }, ctx);
  assert.strictEqual(handled, true);
  assert.match(replied, /^CoolViewer's pp is \d+ inches long!$/);
  const ppLength = Number(replied.match(/is (\d+) inches/)[1]);
  assert.ok(ppLength >= 1 && ppLength <= 100, `pp length ${ppLength} should be between 1 and 100`);
  console.log('builtin command (!pp): ok');

  handled = await commands.handle({ text: '!so somestreamer', username: 'viewer1', isMod: false, isBroadcaster: false, platform: 'twitch' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(replied.toLowerCase().includes('only mods'), 'non-mods should be blocked from !so');
  console.log('!so blocked for non-mods: ok');

  handled = await commands.handle({ text: '!so', username: 'modUser', isMod: true, isBroadcaster: false, platform: 'twitch' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(replied.includes('No one to shout out yet'), 'no target and no last raider should prompt for a username');
  console.log('!so with no target/raider: ok');

  handled = await commands.handle({ text: '!so somestreamer', username: 'modUser', isMod: true, isBroadcaster: false, platform: 'twitch' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(replied.includes('somestreamer'), 'shoutout should mention the given username');
  console.log('!so with explicit target (no Twitch API creds): ok');

  state.setLastRaider('twitch', 'raiderperson');
  handled = await commands.handle({ text: '!so', username: 'modUser', isMod: true, isBroadcaster: false, platform: 'twitch' }, ctx);
  assert.strictEqual(handled, true);
  assert.ok(replied.includes('raiderperson'), 'shoutout should fall back to the last raider when no target is given');
  console.log('!so falls back to last raider: ok');

  // --- Moderation ---
  let result = moderation.evaluate({ username: 'viewer2', text: 'this has a badword in it', isMod: false, isBroadcaster: false });
  assert.strictEqual(result.action, 'warn');
  assert.strictEqual(result.reason, 'banned word');
  console.log('banned word -> warn (1st offense): ok');

  result = moderation.evaluate({ username: 'viewer2', text: 'this has a badword in it', isMod: false, isBroadcaster: false });
  result = moderation.evaluate({ username: 'viewer2', text: 'this has a badword in it', isMod: false, isBroadcaster: false });
  assert.strictEqual(result.action, 'timeout');
  console.log('banned word -> timeout after max warnings: ok');

  result = moderation.evaluate({ username: 'viewer3', text: 'check this out totally-not-spam.com', isMod: false, isBroadcaster: false });
  assert.strictEqual(result.action, 'delete');
  assert.strictEqual(result.reason, 'unapproved link');
  console.log('unapproved link -> delete: ok');

  result = moderation.evaluate({ username: 'viewer3', text: 'clips.twitch.tv/some-clip', isMod: false, isBroadcaster: false });
  assert.strictEqual(result, null);
  console.log('allowlisted link -> clean: ok');

  result = moderation.evaluate({ username: 'viewer4', text: 'THIS IS WAY TOO LOUD FOR CHAT', isMod: false, isBroadcaster: false });
  assert.strictEqual(result.action, 'warn');
  assert.strictEqual(result.reason, 'excessive caps');
  console.log('excessive caps -> warn: ok');

  for (let i = 0; i < 3; i++) {
    result = moderation.evaluate({ username: 'viewer5', text: 'spam message', isMod: false, isBroadcaster: false });
  }
  assert.strictEqual(result.action, 'timeout');
  assert.strictEqual(result.reason, 'repeated message spam');
  console.log('repeated message spam -> timeout: ok');

  result = moderation.evaluate({ username: 'modUser', text: 'this has a badword in it', isMod: true, isBroadcaster: false });
  assert.strictEqual(result, null);
  console.log('mods exempt from moderation: ok');

  configStore.close();
  fs.rmSync(scratchDir, { recursive: true, force: true });
  console.log('\nAll tests passed.');
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  configStore.close();
  fs.rmSync(scratchDir, { recursive: true, force: true });
  process.exit(1);
});

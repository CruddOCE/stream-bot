// Guided setup wizard: installs dependencies, asks which platform(s) you
// want, and walks you through getting credentials for each one — printing
// (and opening) the exact page you need at every step. Writes the result
// to .env for you. Safe to re-run any time to redo a step, add a
// platform, or refresh an expired login.

const fs = require('fs');
const path = require('path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { spawnSync } = require('child_process');

const { openUrl } = require('../src/openBrowser');
const twitchAuth = require('../src/twitchAuth');
const youtubeAuth = require('../src/youtubeAuth');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question, { default: def } = {}) {
  const suffix = def ? ` (${def})` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || def || '';
}

async function confirm(question, defaultYes = true) {
  const suffix = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = (await rl.question(`${question} ${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer.startsWith('y');
}

function step(n, title) {
  console.log(`\n--- Step ${n}: ${title} ---`);
}

// Prints the exact page needed for this step and opens it in the default
// browser — this is the "link at every step" the wizard promises.
function link(url) {
  console.log(`  -> ${url}`);
  openUrl(url);
}

function writeEnvFile(env) {
  const lines = Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, `${lines.join('\n')}\n`);
}

async function setupTwitch(env) {
  console.log('\n=== Twitch setup ===');

  step(1, 'Create a Twitch application');
  console.log('Name it anything, set OAuth Redirect URL to http://localhost:3940/callback, category "Chat Bot".');
  link('https://dev.twitch.tv/console/apps/create');
  env.TWITCH_CLIENT_ID = await ask('Paste the Client ID');

  step(2, 'Generate a Client Secret (optional — enables !so game lookups)');
  console.log('On the same app\'s page, click "New Secret". Press Enter to skip this.');
  link('https://dev.twitch.tv/console/apps');
  const secret = await ask('Paste the Client Secret (optional)');
  if (secret) env.TWITCH_CLIENT_SECRET = secret;

  env.TWITCH_BOT_USERNAME = await ask('Twitch username the bot logs in as');
  env.TWITCH_CHANNEL = (await ask('Your channel name (lowercase, no #)')).toLowerCase();

  step(3, 'Log in as the bot account');
  console.log('A browser tab will open — log in with the BOT account (not your streamer account, unless you want it posting as you) and approve access.');
  await ask('Press Enter when you\'re ready');

  try {
    const token = await twitchAuth.getChatToken(env.TWITCH_CLIENT_ID, { onAuthUrl: link });
    env.TWITCH_OAUTH_TOKEN = `oauth:${token}`;
    console.log('Twitch chat token acquired.');
  } catch (err) {
    console.error(`Twitch login failed: ${err.message}`);
    console.error('You can retry later with: npm run twitch-auth');
  }

  console.log(`\nReminder: in your own Twitch chat, run "/mod ${env.TWITCH_BOT_USERNAME || '<botname>'}" so the bot can time out/delete messages.`);
}

async function setupYoutube(env) {
  console.log('\n=== YouTube setup ===');

  step(1, 'Open or create a Google Cloud project');
  link('https://console.cloud.google.com/projectcreate');
  await confirm('Created/selected a project?', true);

  step(2, 'Enable the YouTube Data API v3');
  link('https://console.cloud.google.com/apis/library/youtube.googleapis.com');
  await confirm('Enabled it?', true);

  step(3, 'Create an API key');
  console.log('Click "Create Credentials" -> "API key".');
  link('https://console.cloud.google.com/apis/credentials');
  env.YOUTUBE_API_KEY = await ask('Paste the API key');

  step(4, 'Find your channel ID');
  link('https://www.youtube.com/account_advanced');
  env.YOUTUBE_CHANNEL_ID = await ask('Paste your Channel ID (starts with UC...)');

  const wantOAuth = await confirm(
    '\nLet the bot reply/delete messages/time out users on YouTube too (not just read chat)?',
    true
  );

  if (wantOAuth) {
    step(5, 'Create an OAuth 2.0 Client ID');
    console.log('Click "Create Credentials" -> "OAuth client ID" -> type "Desktop app".');
    console.log(`Add this as an authorized redirect URI: ${youtubeAuth.REDIRECT_URI}`);
    link('https://console.cloud.google.com/apis/credentials');
    env.YOUTUBE_CLIENT_ID = await ask('Paste the OAuth Client ID');
    env.YOUTUBE_CLIENT_SECRET = await ask('Paste the OAuth Client Secret');

    step(6, 'Log in with your YouTube/Google account');
    console.log('A browser tab will open — log in with the account that owns your channel and approve access.');
    await ask('Press Enter when you\'re ready');

    try {
      const tokens = await youtubeAuth.runConsentFlow(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, {
        onAuthUrl: link,
      });
      if (tokens.refresh_token) {
        env.YOUTUBE_REFRESH_TOKEN = tokens.refresh_token;
        console.log('YouTube refresh token acquired.');
      } else {
        console.warn(
          "No refresh token returned. If you've authorized this app before, revoke access at https://myaccount.google.com/permissions and re-run setup."
        );
      }
    } catch (err) {
      console.error(`YouTube login failed: ${err.message}`);
      console.error('You can retry later with: npm run yt-auth');
    }
  }
}

async function main() {
  console.log('stream-bot setup wizard');
  console.log('Installs dependencies and walks you through getting credentials for Twitch and/or YouTube — opening the exact page you need at each step.\n');

  if (fs.existsSync(ENV_PATH)) {
    const overwrite = await confirm('.env already exists. Overwrite it with new values from this wizard?', false);
    if (!overwrite) {
      console.log('Leaving your existing .env untouched. Exiting.');
      rl.close();
      return;
    }
  }

  console.log('\nInstalling dependencies (npm install)...');
  const install = spawnSync('npm', ['install'], { stdio: 'inherit', shell: true, cwd: ROOT });
  if (install.status !== 0) {
    console.error('\nnpm install failed — fix that first, then re-run: npm run setup');
    rl.close();
    process.exit(1);
  }

  const env = {
    BOT_PREFIX: '!',
    ALERT_SERVER_PORT: '8090',
    ENABLE_TWITCH: 'false',
    ENABLE_YOUTUBE: 'false',
  };

  const platform = (await ask('\nSet up Twitch, YouTube, or both?', { default: 'both' })).toLowerCase();
  const wantTwitch = platform !== 'youtube';
  const wantYoutube = platform !== 'twitch';

  if (wantTwitch) {
    env.ENABLE_TWITCH = 'true';
    await setupTwitch(env);
  }

  if (wantYoutube) {
    env.ENABLE_YOUTUBE = 'true';
    await setupYoutube(env);
  }

  writeEnvFile(env);
  console.log(`\nSetup complete! Wrote ${ENV_PATH}`);
  console.log('Start the bot with: npm start');
  rl.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  rl.close();
  process.exit(1);
});

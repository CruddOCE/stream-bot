// One-time helper: gets a chat OAuth token for your bot account via
// Twitch's implicit-grant flow, and prints it for you to paste into .env.
//
// Requires a free app registered at https://dev.twitch.tv/console/apps
// with OAuth Redirect URL set to: http://localhost:3940/callback
// Put that app's Client ID into .env as TWITCH_CLIENT_ID first.
//
// Prefer a fully guided setup? Run: npm run setup

require('dotenv').config();
const { getChatToken } = require('../src/twitchAuth');

const clientId = process.env.TWITCH_CLIENT_ID;
if (!clientId) {
  console.error('Missing TWITCH_CLIENT_ID in .env. Register an app at https://dev.twitch.tv/console/apps first.');
  process.exit(1);
}

console.log('Opening your browser to log in with your BOT account (not your streamer account, unless you want the bot to post as you).\n');

getChatToken(clientId)
  .then((token) => {
    console.log('\nYour Twitch chat token:\n');
    console.log(`TWITCH_OAUTH_TOKEN=oauth:${token}\n`);
    console.log('Paste that line into your .env file, then set TWITCH_BOT_USERNAME and TWITCH_CHANNEL.');
  })
  .catch((err) => {
    console.error('Twitch login failed:', err.message);
    process.exit(1);
  });

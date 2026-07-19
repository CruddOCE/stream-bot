// One-time helper: runs the Google OAuth consent flow and prints a
// refresh token to paste into .env as YOUTUBE_REFRESH_TOKEN. Only needed
// if you want the bot to post/delete messages or time out users on
// YouTube — reading chat only needs YOUTUBE_API_KEY.
//
// Requires an OAuth 2.0 Client ID ("Web application" type -- "Desktop app"
// type has no redirect URI field) from Google Cloud Console with YouTube
// Data API v3 enabled, and http://localhost:3941/oauth2callback added to
// its authorized redirect URIs.
//
// Prefer a fully guided setup? Run: npm run setup

require('dotenv').config();
const { runConsentFlow } = require('../src/youtubeAuth');

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env. Set those up in Google Cloud Console first.');
  process.exit(1);
}

console.log('Opening your browser to log in with the YouTube/Google account that owns your channel.\n');

runConsentFlow(clientId, clientSecret)
  .then((tokens) => {
    if (tokens.refresh_token) {
      console.log('\nYour YouTube refresh token:\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      console.log('Paste that line into your .env file.');
    } else {
      console.warn("\nNo refresh token returned. If you've authorized this app before, revoke access at https://myaccount.google.com/permissions and try again.");
    }
  })
  .catch((err) => {
    console.error('[yt-auth] Token exchange failed:', err.message);
    process.exit(1);
  });

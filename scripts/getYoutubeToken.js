// One-time helper: runs the Google OAuth consent flow and prints a
// refresh token to paste into .env as YOUTUBE_REFRESH_TOKEN. Only needed
// if you want the bot to post/delete messages or time out users on
// YouTube — reading chat only needs YOUTUBE_API_KEY.
//
// Requires an OAuth 2.0 Client ID ("Desktop app" type) from Google Cloud
// Console with YouTube Data API v3 enabled, and http://localhost:3941/oauth2callback
// added to its authorized redirect URIs.

require('dotenv').config();
const http = require('http');
const { makeOAuthClient, REDIRECT_URI, SCOPES } = require('../src/youtubeAuth');

const oauth2Client = makeOAuthClient();
if (!oauth2Client) {
  console.error('Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env. Set those up in Google Cloud Console first.');
  process.exit(1);
}

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

const url = new URL(REDIRECT_URI);
const port = Number(url.port);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith(url.pathname)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const reqUrl = new URL(req.url, `http://localhost:${port}`);
  const code = reqUrl.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Missing authorization code.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body>Success! You can close this tab and return to the terminal.</body></html>');

    if (tokens.refresh_token) {
      console.log('\nYour YouTube refresh token:\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
      console.log('Paste that line into your .env file.');
    } else {
      console.warn('\nNo refresh token returned. If you\'ve authorized this app before, revoke access at https://myaccount.google.com/permissions and try again.');
    }
  } catch (err) {
    res.writeHead(500);
    res.end('Token exchange failed. Check the terminal.');
    console.error('[yt-auth] Token exchange failed:', err.message);
  } finally {
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  }
});

server.listen(port, () => {
  console.log('Opening your browser to log in with the YouTube/Google account that owns your channel.');
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);
  const { exec } = require('child_process');
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} "${authUrl}"`);
});

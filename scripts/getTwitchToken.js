// One-time helper: gets a chat OAuth token for your bot account via
// Twitch's implicit-grant flow, and prints it for you to paste into .env.
//
// Requires a free app registered at https://dev.twitch.tv/console/apps
// with OAuth Redirect URL set to: http://localhost:3940/callback
// Put that app's Client ID into .env as TWITCH_CLIENT_ID first.

require('dotenv').config();
const http = require('http');

const PORT = 3940;
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ['chat:read', 'chat:edit', 'moderator:manage:banned_users'];

if (!CLIENT_ID) {
  console.error('Missing TWITCH_CLIENT_ID in .env. Register an app at https://dev.twitch.tv/console/apps first.');
  process.exit(1);
}

const authUrl =
  'https://id.twitch.tv/oauth2/authorize' +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  '&response_type=token' +
  `&scope=${encodeURIComponent(SCOPES.join(' '))}`;

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/callback')) {
    // Twitch returns the token in the URL fragment, which never reaches
    // the server directly — serve a tiny page that reads it client-side
    // and posts it back to us.
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body>
      <script>
        const params = new URLSearchParams(window.location.hash.slice(1));
        const token = params.get('access_token');
        fetch('/save?token=' + encodeURIComponent(token || ''));
        document.body.innerText = token
          ? 'Success! You can close this tab and return to the terminal.'
          : 'No token found in redirect. Check the terminal for errors.';
      </script>
    </body></html>`);
  } else if (req.url.startsWith('/save')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const token = url.searchParams.get('token');
    res.writeHead(200);
    res.end('ok');
    if (token) {
      console.log('\nYour Twitch chat token:\n');
      console.log(`TWITCH_OAUTH_TOKEN=oauth:${token}\n`);
      console.log('Paste that line into your .env file, then set TWITCH_BOT_USERNAME and TWITCH_CHANNEL.');
    } else {
      console.error('No token received. Did you approve the app in the browser?');
    }
    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 500);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log('Opening your browser to log in with your BOT account (not your streamer account, unless you want the bot to post as you).');
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);
  const { exec } = require('child_process');
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${opener} "${authUrl}"`);
});

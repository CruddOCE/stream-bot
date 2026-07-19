const http = require('http');
const { openUrl } = require('./openBrowser');

const PORT = 3940;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = ['chat:read', 'chat:edit', 'moderator:manage:banned_users'];
const TIMEOUT_MS = 5 * 60 * 1000;

// Runs Twitch's implicit-grant OAuth flow via a local loopback server and
// resolves with the raw access token (no "oauth:" prefix). Requires a free
// app registered at https://dev.twitch.tv/console/apps with OAuth Redirect
// URL set to REDIRECT_URI.
//
// options.onAuthUrl(url), if given, is called instead of the default
// print-and-open behavior — lets callers (like the setup wizard) format
// the link consistently with their own output.
function getChatToken(clientId, options = {}) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Missing Twitch Client ID.'));
      return;
    }

    const authUrl =
      'https://id.twitch.tv/oauth2/authorize' +
      `?client_id=${encodeURIComponent(clientId)}` +
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
        clearTimeout(timeout);
        server.close();
        if (token) resolve(token);
        else reject(new Error('No token received — did you approve the app in the browser?'));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for Twitch login (5 minutes). Try again.'));
    }, TIMEOUT_MS);

    server.listen(PORT, () => {
      if (options.onAuthUrl) {
        options.onAuthUrl(authUrl);
      } else {
        console.log(`Visit this URL to log in:\n${authUrl}\n`);
        openUrl(authUrl);
      }
    });
  });
}

module.exports = { getChatToken, REDIRECT_URI, SCOPES };

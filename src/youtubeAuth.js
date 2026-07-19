const http = require('http');
const { google } = require('googleapis');
const { openUrl } = require('./openBrowser');

const REDIRECT_URI = 'http://localhost:3941/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/youtube'];
const TIMEOUT_MS = 5 * 60 * 1000;

function buildClient(clientId, clientSecret) {
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function makeOAuthClient() {
  return buildClient(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
}

// Returns an authenticated OAuth2 client if a refresh token is available,
// otherwise null (caller should fall back to API-key-only, read-only mode).
function getAuthedClient() {
  const oauth2Client = makeOAuthClient();
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!oauth2Client || !refreshToken) return null;
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// Runs Google's OAuth consent flow via a local loopback server and resolves
// with the token set (including refresh_token, if granted). Requires an
// OAuth 2.0 Client ID ("Desktop app" type) with REDIRECT_URI added to its
// authorized redirect URIs.
//
// options.onAuthUrl(url), if given, is called instead of the default
// print-and-open behavior — lets callers (like the setup wizard) format
// the link consistently with their own output.
function runConsentFlow(clientId, clientSecret, options = {}) {
  return new Promise((resolve, reject) => {
    const oauth2Client = buildClient(clientId, clientSecret);
    if (!oauth2Client) {
      reject(new Error('Missing YouTube Client ID / Client Secret.'));
      return;
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });

    const redirect = new URL(REDIRECT_URI);
    const port = Number(redirect.port);

    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith(redirect.pathname)) {
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
        clearTimeout(timeout);
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end('Token exchange failed. Check the terminal.');
        clearTimeout(timeout);
        server.close();
        reject(err);
      }
    });

    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for Google login (5 minutes). Try again.'));
    }, TIMEOUT_MS);

    server.listen(port, () => {
      if (options.onAuthUrl) {
        options.onAuthUrl(authUrl);
      } else {
        console.log(`Visit this URL to log in:\n${authUrl}\n`);
        openUrl(authUrl);
      }
    });
  });
}

module.exports = { makeOAuthClient, getAuthedClient, runConsentFlow, buildClient, REDIRECT_URI, SCOPES };

const { google } = require('googleapis');

const REDIRECT_URI = 'http://localhost:3941/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/youtube'];

function makeOAuthClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
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

module.exports = { makeOAuthClient, getAuthedClient, REDIRECT_URI, SCOPES };

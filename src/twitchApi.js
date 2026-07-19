// Minimal Twitch Helix client for public channel lookups (used by !so).
// Uses an app access token via the client-credentials grant, which only
// needs a Client ID + Client Secret — no per-user login required.

let appToken = null;
let tokenExpiry = 0;

async function getAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (appToken && Date.now() < tokenExpiry) return appToken;

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    throw new Error(`Twitch app token request failed: ${res.status}`);
  }

  const data = await res.json();
  appToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return appToken;
}

// Returns { displayName, login, game } or null if unavailable (missing
// credentials, unknown user, API error).
async function getChannelInfo(username) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getAppToken().catch((err) => {
    console.error('[twitchApi]', err.message);
    return null;
  });
  if (!token || !clientId) return null;

  const headers = { 'Client-Id': clientId, Authorization: `Bearer ${token}` };

  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(username)}`, { headers });
  if (!userRes.ok) return null;
  const userData = await userRes.json();
  const user = userData.data && userData.data[0];
  if (!user) return null;

  const channelRes = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${user.id}`, { headers });
  const channelData = channelRes.ok ? await channelRes.json() : null;
  const channel = channelData && channelData.data && channelData.data[0];

  return {
    displayName: user.display_name,
    login: user.login,
    game: channel ? channel.game_name : null,
  };
}

module.exports = { getChannelInfo };

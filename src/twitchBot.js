const tmi = require('tmi.js');
const moderation = require('./moderation');
const commands = require('./commands');

function start() {
  const channel = process.env.TWITCH_CHANNEL;
  const username = process.env.TWITCH_BOT_USERNAME;
  const token = process.env.TWITCH_OAUTH_TOKEN;

  if (!channel || !username || !token) {
    console.error('[twitch] Missing TWITCH_CHANNEL / TWITCH_BOT_USERNAME / TWITCH_OAUTH_TOKEN in .env — skipping Twitch.');
    return null;
  }

  const client = new tmi.Client({
    options: { debug: false },
    identity: { username, password: token },
    channels: [channel],
  });

  client.on('connected', () => {
    console.log(`[twitch] Connected to #${channel} as ${username}`);
  });

  client.on('disconnected', (reason) => {
    console.warn(`[twitch] Disconnected: ${reason}`);
  });

  client.on('message', async (target, tags, text, self) => {
    if (self) return;

    const displayName = tags['display-name'] || tags.username;
    const isMod = Boolean(tags.mod) || tags.badges?.broadcaster === '1';
    const isBroadcaster = tags.badges?.broadcaster === '1';

    const ctx = {
      reply: (msg) => client.say(target, `@${displayName} ${msg}`),
    };

    const modResult = moderation.evaluate({
      username: tags.username,
      text,
      isMod,
      isBroadcaster,
    });

    if (modResult) {
      console.log(`[twitch] mod-action user=${tags.username} reason="${modResult.reason}" action=${modResult.action}`);
      if (modResult.action === 'warn') {
        await client.say(target, `@${displayName} please follow chat rules (${modResult.reason}).`);
      } else if (modResult.action === 'delete' && tags.id) {
        await client.deletemessage(target, tags.id).catch((e) => console.error('[twitch] delete failed:', e.message));
      } else if (modResult.action === 'timeout') {
        await client
          .timeout(target, tags.username, modResult.timeoutSeconds, modResult.reason)
          .catch((e) => console.error('[twitch] timeout failed:', e.message));
      }
      return;
    }

    await commands.handle(
      { text, username: tags.username, isMod, isBroadcaster, platform: 'twitch' },
      ctx
    );
  });

  client.connect().catch((err) => console.error('[twitch] Connection failed:', err.message));

  return client;
}

module.exports = { start };

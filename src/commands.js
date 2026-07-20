const configStore = require('./configStore');
const alertServer = require('./alertServer');
const state = require('./state');
const twitchApi = require('./twitchApi');
const logger = require('./logger');

const startTime = Date.now();
const PREFIX = process.env.BOT_PREFIX || '!';
const MOD_ONLY = new Set(['so']);

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

const BUILTINS = {
  uptime: () => `Bot has been running for ${formatUptime(Date.now() - startTime)}.`,
  commands: () => {
    const custom = Object.keys(configStore.get('commands') || {});
    const builtin = Object.keys(BUILTINS);
    const all = [...builtin, ...custom].map((c) => PREFIX + c);
    return `Available commands: ${all.join(', ')}`;
  },
  joke: () => {
    const jokes = configStore.get('jokes') || [];
    if (jokes.length === 0) return 'No jokes loaded — add some to config/jokes.json.';
    const joke = jokes[Math.floor(Math.random() * jokes.length)];
    alertServer.speak(joke);
    return joke;
  },
  pp: (message) => {
    const name = message.displayName || message.username;
    const length = Math.floor(Math.random() * 100) + 1;
    const reply = `${name}'s pp is ${length} inches long!`;
    alertServer.speak(reply);
    return reply;
  },
  so: async (message, args) => {
    const targetRaw = args[0] || state.getLastRaider(message.platform);
    if (!targetRaw) return 'No one to shout out yet — try !so <username>.';
    const target = targetRaw.replace(/^@/, '');

    let reply;
    if (message.platform === 'twitch') {
      const info = await twitchApi.getChannelInfo(target).catch((err) => {
        logger.action('twitch-api', `!so lookup for "${target}" failed: ${err.message}`, false);
        return null;
      });
      if (info) {
        reply = info.game
          ? `Go check out ${info.displayName} at twitch.tv/${info.login} — they were last streaming ${info.game}!`
          : `Go check out ${info.displayName} at twitch.tv/${info.login}!`;
      }
    }

    if (!reply) reply = `Go check out ${target}!`;
    alertServer.speak(reply);
    return reply;
  },
};

// message: { text, username, displayName, isMod, isBroadcaster, platform }
// ctx: { reply(text) }
async function handle(message, ctx) {
  const text = message.text.trim();
  if (!text.startsWith(PREFIX)) return false;

  const [rawCmd, ...args] = text.slice(PREFIX.length).split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  if (!cmd) return false;

  const logWho = `user=${message.username} platform=${message.platform || 'unknown'}`;

  if (BUILTINS[cmd]) {
    if (MOD_ONLY.has(cmd) && !message.isMod && !message.isBroadcaster) {
      await safeReply(ctx, 'only mods can use that command.', `!${cmd}`, logWho);
      return true;
    }
    let result;
    try {
      result = await BUILTINS[cmd](message, args);
    } catch (err) {
      logger.action('command', `!${cmd} ${logWho} threw an error: ${err.message}`, false);
      return true;
    }
    await safeReply(ctx, result, `!${cmd}`, logWho);
    return true;
  }

  const custom = configStore.get('commands') || {};
  if (Object.prototype.hasOwnProperty.call(custom, cmd)) {
    await safeReply(ctx, custom[cmd], `!${cmd}`, logWho);
    return true;
  }

  return false;
}

async function safeReply(ctx, message, cmdLabel, logWho) {
  try {
    await ctx.reply(message);
    logger.action('command', `${cmdLabel} ${logWho}`);
  } catch (err) {
    logger.action('command', `${cmdLabel} ${logWho} reply failed: ${err.message}`, false);
  }
}

module.exports = { handle, BUILTINS };

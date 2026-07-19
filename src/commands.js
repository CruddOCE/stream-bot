const configStore = require('./configStore');
const alertServer = require('./alertServer');
const state = require('./state');
const twitchApi = require('./twitchApi');

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
    return `${name}'s pp is ${length} inches long!`;
  },
  so: async (message, args) => {
    const targetRaw = args[0] || state.getLastRaider(message.platform);
    if (!targetRaw) return 'No one to shout out yet — try !so <username>.';
    const target = targetRaw.replace(/^@/, '');

    if (message.platform === 'twitch') {
      const info = await twitchApi.getChannelInfo(target).catch(() => null);
      if (info) {
        return info.game
          ? `Go check out ${info.displayName} at twitch.tv/${info.login} — they were last streaming ${info.game}!`
          : `Go check out ${info.displayName} at twitch.tv/${info.login}!`;
      }
    }

    return `Go check out ${target}!`;
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

  if (BUILTINS[cmd]) {
    if (MOD_ONLY.has(cmd) && !message.isMod && !message.isBroadcaster) {
      await ctx.reply('only mods can use that command.');
      return true;
    }
    await ctx.reply(await BUILTINS[cmd](message, args));
    return true;
  }

  const custom = configStore.get('commands') || {};
  if (Object.prototype.hasOwnProperty.call(custom, cmd)) {
    await ctx.reply(custom[cmd]);
    return true;
  }

  return false;
}

module.exports = { handle, BUILTINS };

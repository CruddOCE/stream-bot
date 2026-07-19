const configStore = require('./configStore');

const startTime = Date.now();
const PREFIX = process.env.BOT_PREFIX || '!';

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
};

// message: { text, username, isMod, isBroadcaster, platform }
// ctx: { reply(text) }
async function handle(message, ctx) {
  const text = message.text.trim();
  if (!text.startsWith(PREFIX)) return false;

  const [rawCmd, ...args] = text.slice(PREFIX.length).split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  if (!cmd) return false;

  if (BUILTINS[cmd]) {
    await ctx.reply(BUILTINS[cmd](message, args));
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

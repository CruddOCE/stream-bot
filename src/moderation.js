const configStore = require('./configStore');

// Per-user in-memory state. Cleared on restart by design — this is meant
// to catch bursts within a session, not to be a persistent ban history.
const userState = new Map();

function getUserState(username) {
  if (!userState.has(username)) {
    userState.set(username, { warnings: 0, recentMessages: [] });
  }
  return userState.get(username);
}

const URL_REGEX = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)\b/i;

function isAllowedLink(url, allowlist) {
  return allowlist.some((allowed) => url.toLowerCase().includes(allowed.toLowerCase()));
}

function checkCaps(text, rules) {
  if (text.length < rules.minLength) return false;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length === 0) return false;
  const caps = letters.replace(/[^A-Z]/g, '');
  return caps.length / letters.length >= rules.maxCapsRatio;
}

function checkSpam(username, text, rules) {
  const state = getUserState(username);
  const now = Date.now();
  state.recentMessages = state.recentMessages.filter(
    (m) => now - m.time < rules.windowSeconds * 1000
  );
  state.recentMessages.push({ text, time: now });
  const matches = state.recentMessages.filter((m) => m.text === text).length;
  return matches >= rules.repeatedMessageThreshold;
}

// Returns null if the message is clean, otherwise
// { reason, action, timeoutSeconds }
function evaluate({ username, text, isMod, isBroadcaster }) {
  const rules = configStore.get('moderation');
  if (!rules || !rules.enabled) return null;
  if (isMod || isBroadcaster) return null; // mods/broadcaster are exempt

  const lower = text.toLowerCase();

  if (rules.bannedWords && rules.bannedWords.length > 0) {
    const hit = rules.bannedWords.find((w) => lower.includes(w.toLowerCase()));
    if (hit) {
      return escalate(username, 'banned word', rules);
    }
  }

  if (rules.linkFilter && rules.linkFilter.enabled) {
    const match = text.match(URL_REGEX);
    if (match && !isAllowedLink(match[1], rules.linkFilter.allowlist || [])) {
      return { reason: 'unapproved link', action: rules.linkFilter.action, timeoutSeconds: 60 };
    }
  }

  if (rules.capsFilter && rules.capsFilter.enabled && checkCaps(text, rules.capsFilter)) {
    return escalate(username, 'excessive caps', rules, rules.capsFilter.action);
  }

  if (rules.spamFilter && rules.spamFilter.enabled && checkSpam(username, text, rules.spamFilter)) {
    return {
      reason: 'repeated message spam',
      action: rules.spamFilter.action,
      timeoutSeconds: rules.spamFilter.timeoutSeconds || 60,
    };
  }

  return null;
}

function escalate(username, reason, rules, baseAction = 'warn') {
  const state = getUserState(username);
  if (baseAction !== 'warn') {
    return { reason, action: baseAction, timeoutSeconds: 60 };
  }
  if (!rules.warnBeforeTimeout) {
    return { reason, action: 'timeout', timeoutSeconds: 60 };
  }
  state.warnings += 1;
  if (state.warnings > (rules.maxWarnings || 2)) {
    state.warnings = 0;
    return { reason, action: 'timeout', timeoutSeconds: rules.escalatedTimeoutSeconds || 300 };
  }
  return { reason, action: 'warn', timeoutSeconds: 0 };
}

module.exports = { evaluate, _userState: userState };

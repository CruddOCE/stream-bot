const tmi = require('tmi.js');
const moderation = require('./moderation');
const commands = require('./commands');
const configStore = require('./configStore');
const alertServer = require('./alertServer');
const state = require('./state');
const logger = require('./logger');

function fillTemplate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

function fireAlert(type, defaultTemplate, vars) {
  const alerts = configStore.get('alerts');
  if (!alerts || !alerts.enabled) {
    logger.info('twitch-alert', `${type} alert skipped (alerts disabled)`);
    return;
  }
  const template = (alerts.templates && alerts.templates[type]) || defaultTemplate;
  const message = fillTemplate(template, vars);
  alertServer.alert(type, message);
  logger.action('twitch-alert', `${type}: ${message}`);
}

function start() {
  const channel = process.env.TWITCH_CHANNEL;
  const username = process.env.TWITCH_BOT_USERNAME;
  const token = process.env.TWITCH_OAUTH_TOKEN;

  if (!channel || !username || !token) {
    console.error('[twitch] Missing TWITCH_CHANNEL / TWITCH_BOT_USERNAME / TWITCH_OAUTH_TOKEN in .env — skipping Twitch.');
    logger.action('twitch-connect', 'Skipped: missing TWITCH_CHANNEL / TWITCH_BOT_USERNAME / TWITCH_OAUTH_TOKEN in .env', false);
    return null;
  }

  const client = new tmi.Client({
    options: { debug: false },
    identity: { username, password: token },
    channels: [channel],
  });

  client.on('connected', () => {
    console.log(`[twitch] Connected to #${channel} as ${username}`);
    logger.action('twitch-connect', `Connected to #${channel} as ${username}`);
  });

  client.on('disconnected', (reason) => {
    console.warn(`[twitch] Disconnected: ${reason}`);
    logger.action('twitch-connect', `Disconnected: ${reason}`, false);
  });

  client.on('subscription', (chan, subUsername, method, message, userstate) => {
    fireAlert('sub', '{user} just subscribed!', {
      user: userstate['display-name'] || subUsername,
    });
  });

  client.on('resub', (chan, subUsername, months, message, userstate) => {
    fireAlert('resub', '{user} resubscribed for {months} months!', {
      user: userstate['display-name'] || subUsername,
      months: userstate['msg-param-cumulative-months'] || months,
    });
  });

  client.on('subgift', (chan, gifterUsername, streakMonths, recipient, methods, userstate) => {
    fireAlert('gift', '{user} gifted a sub to {recipient}!', {
      user: userstate['display-name'] || gifterUsername,
      recipient,
    });
  });

  client.on('submysterygift', (chan, gifterUsername, numbOfSubs, methods, userstate) => {
    fireAlert('giftBomb', '{user} gifted {count} subs to the community!', {
      user: userstate['display-name'] || gifterUsername,
      count: numbOfSubs,
    });
  });

  client.on('cheer', (chan, userstate) => {
    fireAlert('cheer', '{user} cheered {bits} bits!', {
      user: userstate['display-name'] || userstate.username,
      bits: userstate.bits,
    });
  });

  client.on('raided', (chan, raiderUsername, viewers) => {
    state.setLastRaider('twitch', raiderUsername);
    fireAlert('raid', '{user} raided with {viewers} viewers!', {
      user: raiderUsername,
      viewers,
    });
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
      const logMsg = `user=${tags.username} reason="${modResult.reason}" action=${modResult.action}`;
      console.log(`[twitch] mod-action ${logMsg}`);
      if (modResult.action === 'warn') {
        await client.say(target, `@${displayName} please follow chat rules (${modResult.reason}).`);
        logger.action('twitch-moderation', logMsg);
      } else if (modResult.action === 'delete' && tags.id) {
        await client
          .deletemessage(target, tags.id)
          .then(() => logger.action('twitch-moderation', logMsg))
          .catch((e) => {
            console.error('[twitch] delete failed:', e.message);
            logger.action('twitch-moderation', `${logMsg} error="${e.message}"`, false);
          });
      } else if (modResult.action === 'timeout') {
        await client
          .timeout(target, tags.username, modResult.timeoutSeconds, modResult.reason)
          .then(() => logger.action('twitch-moderation', logMsg))
          .catch((e) => {
            console.error('[twitch] timeout failed:', e.message);
            logger.action('twitch-moderation', `${logMsg} error="${e.message}"`, false);
          });
      }
      return;
    }

    await commands.handle(
      { text, username: tags.username, displayName, isMod, isBroadcaster, platform: 'twitch' },
      ctx
    );
  });

  client.connect().catch((err) => {
    console.error('[twitch] Connection failed:', err.message);
    logger.action('twitch-connect', `Connection failed: ${err.message}`, false);
  });

  return client;
}

module.exports = { start };

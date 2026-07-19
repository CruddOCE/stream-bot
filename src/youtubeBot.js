const { google } = require('googleapis');
const moderation = require('./moderation');
const commands = require('./commands');
const configStore = require('./configStore');
const alertServer = require('./alertServer');
const { getAuthedClient } = require('./youtubeAuth');

const DEFAULT_POLL_MS = 5000;

function fillTemplate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
}

function fireAlert(type, defaultTemplate, vars) {
  const alerts = configStore.get('alerts');
  if (!alerts || !alerts.enabled) return;
  const template = (alerts.templates && alerts.templates[type]) || defaultTemplate;
  alertServer.alert(type, fillTemplate(template, vars));
}

async function findLiveChatId(youtube, channelId) {
  const search = await youtube.search.list({
    part: 'id',
    channelId,
    eventType: 'live',
    type: 'video',
    maxResults: 1,
  });

  const video = search.data.items && search.data.items[0];
  if (!video) return null;

  const videos = await youtube.videos.list({
    part: 'liveStreamingDetails',
    id: video.id.videoId,
  });

  const details = videos.data.items && videos.data.items[0] && videos.data.items[0].liveStreamingDetails;
  return details ? details.activeLiveChatId : null;
}

async function start() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;

  if (!apiKey || !channelId) {
    console.error('[youtube] Missing YOUTUBE_API_KEY / YOUTUBE_CHANNEL_ID in .env — skipping YouTube.');
    return null;
  }

  const authedClient = getAuthedClient();
  const canModerate = Boolean(authedClient);
  if (!canModerate) {
    console.warn('[youtube] No OAuth refresh token found — running in read-only mode (no replies, no moderation actions). Run `npm run yt-auth` to enable those.');
  }

  const youtube = google.youtube({
    version: 'v3',
    auth: authedClient || apiKey,
  });

  const liveChatId = await findLiveChatId(youtube, channelId).catch((err) => {
    console.error('[youtube] Failed to find an active live stream:', err.message);
    return null;
  });

  if (!liveChatId) {
    console.warn('[youtube] No active live stream found for this channel. The bot will keep retrying every 30s.');
    setTimeout(() => start(), 30000);
    return null;
  }

  console.log(`[youtube] Connected to live chat ${liveChatId}${canModerate ? '' : ' (read-only)'}`);

  let nextPageToken;
  let pollIntervalMs = DEFAULT_POLL_MS;
  const seen = new Set();

  const poll = async () => {
    try {
      const res = await youtube.liveChatMessages.list({
        liveChatId,
        part: 'snippet,authorDetails',
        pageToken: nextPageToken,
      });

      nextPageToken = res.data.nextPageToken;
      pollIntervalMs = Math.max(res.data.pollingIntervalMillis || DEFAULT_POLL_MS, 3000);

      for (const item of res.data.items || []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        const author = item.authorDetails;
        const eventType = item.snippet.type;

        if (eventType === 'superChatEvent' || eventType === 'superStickerEvent') {
          const details = item.snippet.superChatDetails || item.snippet.superStickerDetails || {};
          fireAlert('superchat', '{user} sent a Super Chat: {amount}!', {
            user: author.displayName,
            amount: details.amountDisplayString || '',
          });
          continue;
        }

        if (eventType === 'newSponsorEvent') {
          fireAlert('member', '{user} became a member!', { user: author.displayName });
          continue;
        }

        if (eventType !== 'textMessageEvent') continue;

        const text = item.snippet.displayMessage || '';
        const isMod = Boolean(author.isChatModerator) || Boolean(author.isChatOwner);
        const isBroadcaster = Boolean(author.isChatOwner);

        const ctx = {
          reply: async (msg) => {
            if (!canModerate) {
              console.log(`[youtube] (read-only, would reply) ${msg}`);
              return;
            }
            await youtube.liveChatMessages.insert({
              part: 'snippet',
              requestBody: {
                snippet: {
                  liveChatId,
                  type: 'textMessageEvent',
                  textMessageDetails: { messageText: `${author.displayName} ${msg}` },
                },
              },
            });
          },
        };

        const modResult = moderation.evaluate({ username: author.channelId, text, isMod, isBroadcaster });

        if (modResult) {
          console.log(`[youtube] mod-action user=${author.displayName} reason="${modResult.reason}" action=${modResult.action}`);
          if (!canModerate) continue;
          if (modResult.action === 'warn') {
            await ctx.reply(`please follow chat rules (${modResult.reason}).`).catch(() => {});
          } else if (modResult.action === 'delete') {
            await youtube.liveChatMessages.delete({ id: item.id }).catch((e) => console.error('[youtube] delete failed:', e.message));
          } else if (modResult.action === 'timeout') {
            await youtube.liveChatBans
              .insert({
                part: 'snippet',
                requestBody: {
                  snippet: {
                    liveChatId,
                    type: 'temporary',
                    bannedUserDetails: { channelId: author.channelId },
                    banDurationSeconds: String(modResult.timeoutSeconds),
                  },
                },
              })
              .catch((e) => console.error('[youtube] timeout failed:', e.message));
          }
          continue;
        }

        await commands.handle(
          { text, username: author.channelId, displayName: author.displayName, isMod, isBroadcaster, platform: 'youtube' },
          ctx
        );
      }
    } catch (err) {
      console.error('[youtube] Polling error:', err.message);
    }

    setTimeout(poll, pollIntervalMs);
  };

  poll();

  return { liveChatId };
}

module.exports = { start };

require('dotenv').config();
const configStore = require('./src/configStore');
const twitchBot = require('./src/twitchBot');
const youtubeBot = require('./src/youtubeBot');

configStore.init();

const enableTwitch = (process.env.ENABLE_TWITCH || 'false').toLowerCase() === 'true';
const enableYoutube = (process.env.ENABLE_YOUTUBE || 'false').toLowerCase() === 'true';

if (!enableTwitch && !enableYoutube) {
  console.error('Both ENABLE_TWITCH and ENABLE_YOUTUBE are false (or unset) in .env — nothing to start.');
  process.exit(1);
}

if (enableTwitch) twitchBot.start();
if (enableYoutube) youtubeBot.start();

process.on('SIGINT', () => {
  console.log('\nShutting down.');
  process.exit(0);
});

// Connects to OBS's built-in WebSocket server (OBS 28+ -- enable it via
// Tools > WebSocket Server Settings in OBS) and adds the stream-bot
// overlay as a Browser Source in the current scene, with "Control audio
// via OBS" already turned on so !joke TTS and alert chimes play through
// OBS's mixer without any manual setup.
//
// Usage: node scripts/addObsSource.js
// Reads OBS_WEBSOCKET_PASSWORD from .env (leave blank if OBS has no
// password set) and ALERT_SERVER_PORT for the overlay URL.

require('dotenv').config();
const crypto = require('crypto');
const WebSocket = require('ws');
const logger = require('../src/logger');

const OBS_URL = process.env.OBS_WEBSOCKET_URL || 'ws://127.0.0.1:4455';
const OBS_PASSWORD = process.env.OBS_WEBSOCKET_PASSWORD || '';
const ALERT_PORT = process.env.ALERT_SERVER_PORT || 8090;
const OVERLAY_URL = `http://localhost:${ALERT_PORT}/overlay.html`;
const SOURCE_NAME = process.env.OBS_SOURCE_NAME || 'stream-bot Overlay';
const CONNECT_TIMEOUT_MS = 8000;

function sha256Base64(input) {
  return crypto.createHash('sha256').update(input).digest('base64');
}

// obs-websocket v5 auth: base64(sha256(base64(sha256(password + salt)) + challenge))
function computeAuthString(password, salt, challenge) {
  const secret = sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(OBS_URL);
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    };

    const timeout = setTimeout(() => {
      fail(new Error('Timed out connecting to OBS.'));
      ws.terminate();
    }, CONNECT_TIMEOUT_MS);

    ws.on('error', (err) => fail(new Error(`Could not connect to OBS at ${OBS_URL}: ${err.message}`)));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }

      if (msg.op === 0) {
        // Hello -- reply with Identify, including the auth hash if OBS requires one.
        const identify = { rpcVersion: 1, eventSubscriptions: 0 };
        if (msg.d.authentication) {
          if (!OBS_PASSWORD) {
            fail(new Error('OBS requires a WebSocket password (set one in OBS > Tools > WebSocket Server Settings), but OBS_WEBSOCKET_PASSWORD is empty.'));
            ws.close();
            return;
          }
          identify.authentication = computeAuthString(OBS_PASSWORD, msg.d.authentication.salt, msg.d.authentication.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: identify }));
      } else if (msg.op === 2) {
        // Identified -- ready to send requests.
        clearTimeout(timeout);
        settled = true;
        resolve(ws);
      }
    });
  });
}

function sendRequest(ws, requestType, requestData) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const onMessage = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }
      if (msg.op === 7 && msg.d.requestId === requestId) {
        ws.off('message', onMessage);
        if (msg.d.requestStatus.result) {
          resolve(msg.d.responseData || {});
        } else {
          reject(new Error(`${requestType} failed: ${msg.d.requestStatus.comment || `code ${msg.d.requestStatus.code}`}`));
        }
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
  });
}

async function main() {
  console.log(`Connecting to OBS at ${OBS_URL}...`);
  let ws;
  try {
    ws = await connect();
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error('Make sure OBS is running and WebSocket Server is enabled: Tools > WebSocket Server Settings.');
    logger.action('obs-connect', err.message, false);
    process.exitCode = 1;
    return;
  }

  console.log('Connected to OBS.');
  logger.action('obs-connect', `Connected to OBS at ${OBS_URL}`);

  try {
    const sceneInfo = await sendRequest(ws, 'GetSceneList', {});
    const sceneName = sceneInfo.currentProgramSceneName;
    if (!sceneName) throw new Error('Could not determine the current OBS scene.');
    console.log(`Adding to scene: ${sceneName}`);

    await sendRequest(ws, 'CreateInput', {
      sceneName,
      inputName: SOURCE_NAME,
      inputKind: 'browser_source',
      inputSettings: {
        url: OVERLAY_URL,
        width: 1920,
        height: 1080,
        // OBS's internal name for the "Control audio via OBS" checkbox --
        // routes the overlay's TTS/chime audio through OBS's mixer.
        reroute_audio: true,
      },
      sceneItemEnabled: true,
    });

    console.log(`SUCCESS: Added "${SOURCE_NAME}" (${OVERLAY_URL}) to scene "${sceneName}", with OBS controlling its audio.`);
    logger.action('obs-source', `Added "${SOURCE_NAME}" (${OVERLAY_URL}) to scene "${sceneName}"`);
  } catch (err) {
    console.error('FAILED:', err.message);
    console.error('If a source with that name already exists in OBS, delete it first, or set OBS_SOURCE_NAME to a different name.');
    logger.action('obs-source', err.message, false);
    process.exitCode = 1;
  } finally {
    ws.close();
  }
}

main();

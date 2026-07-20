const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const logger = require('./logger');
const configStore = require('./configStore');

let wss = null;
let server = null;
let listeningPort = null;

function start() {
  const port = Number(process.env.ALERT_SERVER_PORT) || 8090;
  listeningPort = port;

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Lets the control panel trigger a real alert + TTS on demand, so you
  // can confirm the OBS Browser Source is actually connected and its
  // audio is routed correctly before going live -- without waiting for
  // a real sub/cheer/raid to test it.
  app.get('/test-alert', (req, res) => {
    const connected = getConnectedCount();
    alert('test', 'Test alert! If you can see this and hear a sound, OBS is connected correctly.');
    speak('This is a test alert from stream bot. If you can hear this, your OBS audio is set up correctly.');
    logger.action('test-alert', `Triggered manually (${connected} overlay(s) connected)`);
    res.json({ ok: true, connectedOverlays: connected });
  });

  server = http.createServer(app);
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('[alerts] Overlay connected');
    logger.action('overlay-connect', 'Overlay browser source connected');

    // A browser source that disappears without a clean close (OBS scene
    // switch, network blip, computer sleep) leaves a "zombie" entry here
    // forever otherwise -- ws has no built-in dead-peer detection, so
    // getConnectedCount() would keep reporting a connection that's
    // actually gone, and broadcasts would silently go nowhere.
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      logger.info('overlay-connect', 'Overlay browser source disconnected');
    });
  });

  // Every 20s, ping each client and terminate anyone who didn't pong back
  // since the last round -- this is what actually catches zombie
  // connections (see comment above). unref() so this timer alone can't
  // keep the process alive.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        logger.info('overlay-connect', 'Overlay connection timed out (no response to ping) -- removing it');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 20000);
  heartbeat.unref();

  server.listen(port, () => {
    console.log(`[alerts] Overlay running at http://localhost:${port}/overlay.html — add this as an OBS Browser Source`);
    logger.action('alert-server', `Listening at http://localhost:${port}/overlay.html`);
  });

  server.on('error', (err) => {
    console.error('[alerts] Server error:', err.message);
    logger.action('alert-server', `Failed to start on port ${port}: ${err.message}`, false);
  });

  return server;
}

function getConnectedCount() {
  if (!wss) return 0;
  return Array.from(wss.clients).filter((c) => c.readyState === WebSocket.OPEN).length;
}

function broadcast(payload) {
  if (!wss) {
    logger.action('alert-broadcast', `${payload.kind} broadcast attempted but the alert server isn't running`, false);
    return;
  }
  const connectedClients = getConnectedCount();
  if (connectedClients === 0) {
    logger.action(
      'alert-broadcast',
      `${payload.kind} broadcast attempted but no overlay is connected -- add http://localhost:${listeningPort}/overlay.html as an OBS Browser Source (or open it in a browser to test)`,
      false
    );
    return;
  }
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// type: 'sub' | 'resub' | 'gift' | 'giftBomb' | 'cheer' | 'raid' | 'superchat' | 'member'
function alert(type, message) {
  console.log(`[alerts] ${type}: ${message}`);
  const alerts = configStore.get('alerts');
  const displaySeconds = alerts && alerts.displaySeconds;
  broadcast({ kind: 'alert', type, message, displaySeconds });
}

// Used when the bot can't actually post a reply (YouTube read-only mode,
// no OAuth) -- shows the command reply as a quiet overlay toast instead, so
// !pp/!so/custom commands are still visible somewhere even though nothing
// appears in YouTube chat itself. No chime, since this can fire on every
// single command instead of just real events.
function commandReply(username, message) {
  console.log(`[reply] ${username}: ${message}`);
  const alerts = configStore.get('alerts');
  const displaySeconds = alerts && alerts.displaySeconds;
  broadcast({ kind: 'alert', type: 'reply', message: `${username}: ${message}`, displaySeconds, silent: true });
}

// Sent to the overlay, which reads it aloud via the browser's built-in
// text-to-speech (so it plays through OBS's audio capture of the
// Browser Source — no external TTS service or API key needed).
function speak(text) {
  broadcast({ kind: 'tts', text });
}

module.exports = { start, alert, speak, commandReply };

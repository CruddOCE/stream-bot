const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

let wss = null;
let server = null;

function start() {
  const port = Number(process.env.ALERT_SERVER_PORT) || 8090;

  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));

  server = http.createServer(app);
  wss = new WebSocket.Server({ server });

  wss.on('connection', () => {
    console.log('[alerts] Overlay connected');
  });

  server.listen(port, () => {
    console.log(`[alerts] Overlay running at http://localhost:${port}/overlay.html — add this as an OBS Browser Source`);
  });

  return server;
}

function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });
}

// type: 'sub' | 'resub' | 'gift' | 'giftBomb' | 'cheer' | 'raid' | 'superchat' | 'member'
function alert(type, message) {
  console.log(`[alerts] ${type}: ${message}`);
  broadcast({ kind: 'alert', type, message });
}

// Sent to the overlay, which reads it aloud via the browser's built-in
// text-to-speech (so it plays through OBS's audio capture of the
// Browser Source — no external TTS service or API key needed).
function speak(text) {
  broadcast({ kind: 'tts', text });
}

module.exports = { start, alert, speak };

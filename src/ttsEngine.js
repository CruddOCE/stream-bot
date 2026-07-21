// Server-side text-to-speech using Windows' built-in SAPI voices (via
// PowerShell's System.Speech), rendered to a WAV file the overlay plays
// with a plain <audio> tag. This exists specifically because OBS's Browser
// Source generally exposes zero voices to the browser's own Web Speech API
// -- generating the audio ourselves sidesteps that limitation entirely,
// since audio file playback doesn't depend on OBS exposing any voices.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TTS_DIR = path.join(__dirname, '..', 'public', 'tts');
const FILE_LIFETIME_MS = 30000;

let cachedVoices = null;
let voicesPromise = null;

function ensureDir() {
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
}

// The process gets restarted often during development (and can be killed
// less than 30s after generating a file, before its self-delete timer
// fires) -- sweep out anything left over from a previous run on startup,
// rather than letting public/tts/ accumulate orphaned WAV files forever.
function cleanupStaleFiles() {
  if (!fs.existsSync(TTS_DIR)) return;
  try {
    for (const file of fs.readdirSync(TTS_DIR)) {
      fs.unlinkSync(path.join(TTS_DIR, file));
    }
  } catch (err) {
    // Best-effort; a leftover file or two isn't worth failing startup over.
  }
}
cleanupStaleFiles();

// Async so it never blocks the event loop (Twitch/YouTube polling, the
// alert server, everything) -- the in-flight promise is cached too, so
// concurrent calls before the first one resolves don't spawn duplicate
// PowerShell processes.
function getInstalledVoices() {
  if (cachedVoices) return Promise.resolve(cachedVoices);
  if (!voicesPromise) {
    const script =
      'Add-Type -AssemblyName System.Speech; ' +
      '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ' +
      'Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }';
    voicesPromise = new Promise((resolve) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 10000 }, (err, stdout) => {
        cachedVoices = err ? [] : stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        resolve(cachedVoices);
      });
    });
  }
  return voicesPromise;
}

async function pickRandomVoice() {
  const voices = await getInstalledVoices();
  if (voices.length === 0) return null;
  return voices[Math.floor(Math.random() * voices.length)];
}

function psSingleQuote(str) {
  // Single-quoted PowerShell strings are literal (no $variable expansion,
  // no backtick escapes) -- the only thing that needs escaping is a
  // literal single quote, doubled per PowerShell's own quoting rule.
  return str.replace(/'/g, "''");
}

// Synthesizes `text` to a WAV file using a randomly chosen installed voice.
// Resolves with { url, voice }; the file is served at that URL via the
// existing public/ static route and deleted a bit after it should have
// finished playing.
async function synthesize(text) {
  ensureDir();
  const voice = await pickRandomVoice();
  const id = crypto.randomBytes(8).toString('hex');
  const filePath = path.join(TTS_DIR, `${id}.wav`);

  const scriptParts = ['Add-Type -AssemblyName System.Speech', '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer'];
  if (voice) scriptParts.push(`$synth.SelectVoice('${psSingleQuote(voice)}')`);
  scriptParts.push(`$synth.SetOutputToWaveFile('${psSingleQuote(filePath)}')`);
  scriptParts.push(`$synth.Speak('${psSingleQuote(text)}')`);
  scriptParts.push('$synth.Dispose()');

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', scriptParts.join('; ')],
      { timeout: 15000 },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({ url: `/tts/${id}.wav`, voice });
        setTimeout(() => fs.unlink(filePath, () => {}), FILE_LIFETIME_MS);
      }
    );
  });
}

module.exports = { synthesize, getInstalledVoices };

// Server-side text-to-speech using Windows' built-in SAPI voices (via
// PowerShell's System.Speech), rendered to a WAV file the overlay plays
// with a plain <audio> tag. This exists specifically because OBS's Browser
// Source generally exposes zero voices to the browser's own Web Speech API
// -- generating the audio ourselves sidesteps that limitation entirely,
// since audio file playback doesn't depend on OBS exposing any voices.

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TTS_DIR = path.join(__dirname, '..', 'public', 'tts');
const FILE_LIFETIME_MS = 30000;

let cachedVoices = null;

function ensureDir() {
  if (!fs.existsSync(TTS_DIR)) fs.mkdirSync(TTS_DIR, { recursive: true });
}

function getInstalledVoices() {
  if (cachedVoices) return cachedVoices;
  try {
    const script =
      'Add-Type -AssemblyName System.Speech; ' +
      '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ' +
      'Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name }';
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 10000,
    });
    cachedVoices = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    cachedVoices = [];
  }
  return cachedVoices;
}

function pickRandomVoice() {
  const voices = getInstalledVoices();
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
function synthesize(text) {
  return new Promise((resolve, reject) => {
    ensureDir();
    const voice = pickRandomVoice();
    const id = crypto.randomBytes(8).toString('hex');
    const filePath = path.join(TTS_DIR, `${id}.wav`);

    const scriptParts = ['Add-Type -AssemblyName System.Speech', '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer'];
    if (voice) scriptParts.push(`$synth.SelectVoice('${psSingleQuote(voice)}')`);
    scriptParts.push(`$synth.SetOutputToWaveFile('${psSingleQuote(filePath)}')`);
    scriptParts.push(`$synth.Speak('${psSingleQuote(text)}')`);
    scriptParts.push('$synth.Dispose()');

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

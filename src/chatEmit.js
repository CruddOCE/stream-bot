// Emits a structured, single-line marker to stdout whenever a chat
// message arrives. stream-bot-control.exe parses lines starting with
// "@@CHAT@@|" to render a live, per-user-colored chat feed -- everything
// else on stdout is just shown as plain log text. Free-text fields are
// base64-encoded so no delimiter escaping is needed (chat messages can
// contain anything, including "|" or newlines).

function b64(str) {
  return Buffer.from(String(str), 'utf8').toString('base64');
}

function emitChatLine(platform, username, isMod, isBroadcaster, text) {
  console.log(`@@CHAT@@|${platform}|${b64(username)}|${isMod ? 1 : 0}|${isBroadcaster ? 1 : 0}|${b64(text)}`);
}

module.exports = { emitChatLine };

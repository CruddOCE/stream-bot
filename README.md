# stream-bot

A local Twitch + YouTube live chat bot: custom commands and auto-moderation,
running on your own machine (no hosting required).

**Status: test/early version.** The core (chat connection, commands,
auto-mod) is built and has an offline test suite, but it hasn't been run
against a real live Twitch or YouTube stream yet — try it on a low-stakes
stream first and watch the console output before trusting it on a real one.

## What it does

- Connects to your Twitch channel's chat and/or your YouTube channel's live
  chat at the same time.
- Built-in commands: `!commands`, `!uptime`, `!joke` (random clean joke from
  `config/jokes.json`, no racist material — add/remove your own anytime),
  `!so` (mod-only shoutout — see below), `!pp` (random 1-100 inch joke
  command, replies "`<name>`'s pp is X inches long!").
- Custom commands you define yourself in `config/commands.json` — no code
  editing, and changes apply live (no restart needed).
- Auto-moderation: banned words, link blocking (with an allowlist), excessive
  caps, and repeated-message spam — each escalates from a warning to a
  timeout, configurable in `config/moderation.json` (also hot-reloads).
- Mods and the broadcaster are always exempt from auto-mod.
- Stream alerts + an OBS overlay: subs, resubs, gift subs, cheers, and raids
  on Twitch; Super Chats and new memberships on YouTube. Runs on a small
  local web server you add to OBS as a Browser Source.
- `!joke` is also read aloud through the overlay using the browser's
  built-in text-to-speech, so it plays through OBS — no paid TTS service or
  API key needed.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer.
- A Twitch account for the bot to log in as (can be your main account or a
  separate one — a separate one is recommended so chat clearly shows the bot
  as a bot).
- For Twitch moderation actions (timeout/delete), the bot account must be a
  moderator in your channel: type `/mod <botname>` in your own Twitch chat.
- For YouTube, a Google account and a free Google Cloud project.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Copy the environment template:

   ```
   cp .env.example .env
   ```

3. Fill in `.env` for whichever platform(s) you're using — see below.

4. Run it:

   ```
   npm start
   ```

### Twitch setup

1. Register a free app at https://dev.twitch.tv/console/apps
   - OAuth Redirect URL: `http://localhost:3940/callback`
   - Copy the generated **Client ID** into `.env` as `TWITCH_CLIENT_ID`.
2. Run the token helper:

   ```
   npm run twitch-auth
   ```

   This opens your browser, has you log in with your **bot account**, and
   prints a `TWITCH_OAUTH_TOKEN` line to paste into `.env`.
3. Also set in `.env`:
   - `TWITCH_BOT_USERNAME` — the bot account's username
   - `TWITCH_CHANNEL` — your channel name (lowercase, no `#`)
   - `ENABLE_TWITCH=true`
4. In your own Twitch chat, run `/mod <botname>` so it can time out/delete.

### YouTube setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **YouTube Data API v3**.
2. Create an **API key** (APIs & Services → Credentials) and put it in
   `.env` as `YOUTUBE_API_KEY`. This alone lets the bot *read* chat and run
   commands in read-only/log mode.
3. Set `YOUTUBE_CHANNEL_ID` in `.env` to your channel's ID (starts with
   `UC...` — find it in YouTube Studio → Settings → Channel → Advanced).
4. Set `ENABLE_YOUTUBE=true`.
5. **Optional but recommended:** to let the bot actually reply, delete
   messages, and time out users on YouTube (not just log what it would do),
   create an **OAuth 2.0 Client ID** (type: Desktop app) in the same
   Credentials page, add `http://localhost:3941/oauth2callback` to its
   authorized redirect URIs, and put the Client ID/Secret in `.env` as
   `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`. Then run:

   ```
   npm run yt-auth
   ```

   and paste the printed `YOUTUBE_REFRESH_TOKEN` line into `.env`.

Without the OAuth step, YouTube mode is read-only: it'll log what command or
moderation action it *would* have taken, which is a safe way to test it
during a real stream before granting write access.

## OBS overlay + alerts

The bot runs a small local server (default `http://localhost:8090`) that
serves an overlay page and pushes alerts/TTS to it over a WebSocket.

1. In OBS, add a **Browser Source**.
2. Set the URL to `http://localhost:8090/overlay.html` (change the port via
   `ALERT_SERVER_PORT` in `.env` if you changed it).
3. Set width/height to your canvas size (e.g. 1920x1080), and leave
   "Control audio via OBS" **checked** — this is what routes the `!joke`
   text-to-speech (and the alert chime) into your OBS audio mixer.

Triggers automatically, no extra setup:

- Twitch: subscriptions, resubs, gift subs (single + community gifts),
  cheers, raids.
- YouTube: Super Chats/Super Stickers, new memberships.

Edit the alert text in `config/alerts.json` (hot-reloads, no restart):

```json
{
  "templates": {
    "sub": "{user} just subscribed!",
    "raid": "{user} raided with {viewers} viewers!"
  }
}
```

Available placeholders per event: `sub`/`member` → `{user}`; `resub` →
`{user} {months}`; `gift` → `{user} {recipient}`; `giftBomb` → `{user}
{count}`; `cheer` → `{user} {bits}`; `raid` → `{user} {viewers}`;
`superchat` → `{user} {amount}`.

## Shoutouts (`!so`)

Mod-only (and broadcaster). Usage:

- `!so <username>` — shouts out a specific user.
- `!so` with no argument — shouts out the last person who raided the
  channel (Twitch only; resets each time the bot restarts).

On Twitch, if `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set in
`.env` (same app you registered for `twitch-auth`, generate a Client Secret
on the same page), it looks up the target's channel and includes what game
they were last streaming. Without those, or on YouTube, it falls back to a
plain "go check out `<user>`" message.

## Adding your own commands

Edit `config/commands.json`:

```json
{
  "hello": "Hey there, welcome to the stream!",
  "discord": "Join here: https://discord.gg/your-invite"
}
```

Save the file — it reloads automatically, no restart needed.

## Tuning auto-moderation

Edit `config/moderation.json`. Key fields:

- `bannedWords` — list of substrings to block.
- `linkFilter.allowlist` — domains that are OK to post (e.g. your own clip
  links).
- `capsFilter` — flags messages that are mostly capital letters.
- `spamFilter` — flags a user repeating the same message.
- `maxWarnings` — how many warnings before a timeout kicks in.

Also hot-reloads on save.

## Running the test suite

Runs entirely offline — no credentials or network needed:

```
npm test
```

## Known limitations (this test version)

- Not yet verified against a real live Twitch/YouTube stream — please watch
  the console the first time you run it live.
- No song requests yet.
- No voice/console control for manually triggering mod actions yet.
- YouTube moderation requires the OAuth step above; API-key-only mode is
  read-only.
- `!so`'s "last raided" memory only tracks Twitch raids and resets on
  restart; on YouTube (or after a restart) you need to pass a username.
- Overlay TTS quality depends on whatever voices your OS/Chromium have
  installed — it's the browser's built-in speech synthesis, not a
  dedicated TTS service.

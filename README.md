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
- A one-click on/off control panel (`stream-bot-control.exe`) for turning
  the bot on before a stream and off after — see below.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer.
- A Twitch account for the bot to log in as (can be your main account or a
  separate one — a separate one is recommended so chat clearly shows the bot
  as a bot).
- For Twitch moderation actions (timeout/delete), the bot account must be a
  moderator in your channel: type `/mod <botname>` in your own Twitch chat.
- For YouTube, a Google account and a free Google Cloud project.

## Easiest: double-click install-stream-bot.exe

Double-click [`install-stream-bot.exe`](install-stream-bot.exe) — it opens a
console window that installs dependencies, runs the setup wizard (see
below) if you haven't configured `.env` yet, and then starts the bot. That's
the whole process; no terminal typing required.

It's a tiny native launcher (source in [`installer/Program.cs`](installer/Program.cs),
compiled with the C# compiler that ships with Windows — nothing downloaded)
that just opens [`install-and-start.bat`](install-and-start.bat), which does
the actual work. Requires Node.js to already be installed — if it isn't,
the script opens the download page for you and stops so you can install it
first, then run it again.

Re-running it later is safe: if `.env` already exists it'll ask whether you
want to redo the setup wizard, then start the bot either way.

It also creates (or refreshes) a **`stream-bot` shortcut on your Desktop**
pointing at the control panel below, so you don't need to come back to this
folder to launch it day-to-day.

## Day-to-day: stream-bot-control.exe

Once you've set up once, use [`stream-bot-control.exe`](stream-bot-control.exe)
to turn the bot on and off around your streams — a proper dashboard, not
just a bare console window:

- **Live Chat panel** — every Twitch/YouTube message shows up as it
  arrives, with a timestamp, a color-coded platform tag (`[Twitch]` /
  `[YouTube]`), a `[MOD]`/`[HOST]` badge where it applies, and each
  username rendered in its own consistent color (the same person is
  always the same color, so it's obvious at a glance who's talking).
- **Activity Log panel** — the same diagnostic output as before
  (connections, mod actions, alerts, errors), kept separate from chat so
  the two don't get mixed together.
- A **Start Bot / Stop Bot** button — click it after you go live (or
  before; Twitch chat is joinable regardless of live status, and YouTube
  just retries every 30s until a stream is found).
- **Add OBS Browser Source** — connects to OBS's WebSocket server and adds
  the overlay to your current scene automatically, with "Control audio via
  OBS" already turned on (see [OBS overlay + alerts](#obs-overlay--alerts)
  below). Needs your OBS WebSocket password in the field next to it, if
  you've set one.
- **Update** — pulls the latest version from GitHub and reinstalls
  dependencies. The app closes itself, updates, then reopens automatically
  (needed because Windows won't let a running program overwrite its own
  file) — a console window shows progress in between. Any local edits to
  your `config/*.json` files are preserved.

**Closing the window stops the bot automatically** — that's the whole
"turn it off after streaming" step, nothing else to remember. If the bot
process crashes or exits on its own for any reason, the window detects that
and updates itself back to "stopped" too.

Every command run, moderation action, alert, and connection attempt is also
written to `logs/bot.log` (gitignored), tagged OK/FAIL with a timestamp —
so if something silently didn't work (e.g. an alert fired but no OBS
overlay was connected to receive it), it's not actually silent; check that
file after a stream.

It's the same kind of tiny compiled launcher as the installer (source in
[`installer/ControlProgram.cs`](installer/ControlProgram.cs)) — it just
runs `node index.js` directly and shows you its output, so you still need
to have run the installer/wizard at least once first.

## Guided wizard (npm run setup)

If you'd rather run it from a terminal yourself, or you're not on Windows,
the wizard is just:

```
npm run setup
```

It installs dependencies, asks which platform(s) you want, and walks you
through each one, printing (and opening) the exact page you need to be on
at every step. Then:

```
npm start
```

Safe to re-run `npm run setup` any time — to redo a step, add the other
platform, or refresh a login that expired.

If a step gets stuck (browser doesn't open, login times out after 5
minutes), you can always finish that one piece manually — see below.

## Manual setup

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
   messages, and time out users on YouTube (not just log what it would do):

   a. **Configure the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) first** — skip this and you'll hit `Access blocked... Error 403: access_denied` later even with a correct Client ID. If this is your first OAuth client in the project:
      - User Type: **External** (unless you have a Google Workspace account)
      - App name/support email/developer email: anything, your own email
      - Click through Scopes without adding any
      - On the **Test users** step, click **"+ ADD USERS"** and add the Google account you'll actually log in with (yourself) — apps left in "Testing" publishing status only allow pre-approved test-user emails to log in. **This is the step that fixes `access_denied`.**

   b. Create an **OAuth 2.0 Client ID** on the [Credentials page](https://console.cloud.google.com/apis/credentials) — click
   "+ CREATE CREDENTIALS" → "OAuth client ID". For **Application type**,
   pick **"Web application"** (not "Desktop app" — despite this being a
   desktop tool, only "Web application" gives you a redirect URI field to
   fill in, which this flow needs). Under **Authorized redirect URIs**,
   add `http://localhost:3941/oauth2callback` exactly, then put the
   Client ID/Secret in `.env` as `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`.

   c. Log in with the **same account** you added as a test user in step (a) — a different account will hit `access_denied` again. Run:

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

### Easiest: the "Add OBS Browser Source" button

In [`stream-bot-control.exe`](stream-bot-control.exe), enter your OBS
WebSocket password (if you set one — find it in OBS under **Tools →
WebSocket Server Settings → Show Connect Info**) and click **Add OBS
Browser Source**. It connects to OBS's built-in WebSocket server (OBS 28+)
and adds the overlay to your current scene with "Control audio via OBS"
already turned on — no manual steps in OBS's UI at all.

This talks to OBS using its documented WebSocket protocol
(`scripts/addObsSource.js`) — connection failures (OBS not running,
WebSocket Server not enabled, wrong password) are reported clearly in the
log rather than failing silently. If a source with the same name already
exists, delete it in OBS first, or set `OBS_SOURCE_NAME` in `.env` to a
different name.

### Manual setup

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

## Uninstalling

If something isn't working and you want to back out: double-click
[`uninstall-stream-bot.exe`](uninstall-stream-bot.exe) (or run `npm run
uninstall` / `uninstall.bat` from a terminal). It will:

1. Check whether the bot is currently running and offer to stop it
2. Ask before removing installed dependencies (`node_modules`) — safe,
   reinstall anytime with `npm install` or the installer
3. Ask before removing your saved credentials (`.env`) — this deletes your
   Twitch/YouTube tokens, so you'd need to redo the setup wizard afterward;
   defaults to **no** since it's the more destructive option

It never touches your source code, your custom `config/*.json`
(commands/jokes/moderation/alerts), or git history — those are yours, not
install artifacts. To remove the project entirely, delete the folder
yourself (and delete the GitHub repo yourself, if you want that gone too —
neither of those is something this script does automatically).

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

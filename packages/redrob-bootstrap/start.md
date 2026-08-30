
You are an agent helping a user install and set up Redrob Work.

Goal: install Redrob Work, install the desktop app, and open it ready to use on
the user's own files.

> The bootstrap command is `redrob-bootstrap`. Use that exact command for
> these setup steps so the bootstrap flow stays distinct from other Redrob Work
> tooling a user may already have on their PATH.

## 1. Install CLI

Install the `redrob-bootstrap` CLI into a user-writable bin dir.

If you already have this repository locally:

```bash
node packages/redrob-bootstrap/bin/redrob.mjs install \
  --install-dir "$HOME/.redrob/bootstrap" \
  --bin-dir "$HOME/.local/bin" \
  --json
```

In production, download the bootstrap script, inspect it, then run it. Do not
pipe remote scripts directly into a shell. The script downloads the
`redrob-bootstrap` CLI (a single dependency-free Node file) and installs it
into `$HOME/.local/bin` - no npm or npx required.

```bash
curl -fsSLo /tmp/redrob-install.sh https://redrob.io/install.sh
less /tmp/redrob-install.sh
sh /tmp/redrob-install.sh
```

Verify:

```bash
redrob-bootstrap doctor --json
```

## 2. Install App

Install the desktop app for this OS from the manifest:

```bash
redrob-bootstrap install app \
  --manifest https://redrob.io/install-manifest.json \
  --json
```

Verify:

```bash
redrob-bootstrap doctor --app --json
```

## 3. Launch the App

Open the desktop app so the user lands on the connect screen.

```bash
open -a "Redrob Work"    # macOS
```

Inference is connected from inside the app. The connect screen has one button,
**Redrob로 연결**, which opens console.redrob.ai and shows a short code; the user
signs in, approves that code, and the app is given a workspace key on its own.

Do not ask the user for a key here, and do not put one in this conversation. A
key pasted by hand is still accepted in the app, on the same screen, for a
machine that cannot open a browser.

## 4. Finish Well (most important step)

Do NOT end by dumping readiness JSON or a list of `ok: true` checks. The user
does not care about flags — they want to know what to do next. End with a short,
friendly, human message that gives momentum:

1. Confirm in one line that Redrob Work is installed and open.
2. Tell them to press **Redrob로 연결** on the connect screen and approve the code
   in the browser, if they have not yet.
3. Point them at ONE concrete first task they can run right now, e.g. "try
   typing: 'summarize the files in my Downloads folder' and hit Run."

Keep it to a few sentences. Warm, concrete, action-oriented. No JSON, no
checklists, no internal flag names in the final message.

## 5. Success Criteria (internal — do not show the user)

- `redrob-bootstrap doctor --json` reports `ok: true`.
- `redrob-bootstrap doctor --app --json` reports the installed app.
- The desktop app opens.

If any step fails, say exactly which command failed and what its output was.
Never claim setup succeeded without the command output that proves it.

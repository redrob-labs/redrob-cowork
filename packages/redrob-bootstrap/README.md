# Redrob Work Bootstrap CLI

Script-installable `redrob-bootstrap` command for agent-first install.

This package is intentionally small and does not assume npm is the install
channel. A bootstrap script can place `bin/redrob.mjs` on disk, then run:

```bash
redrob-bootstrap install --bin-dir ~/.local/bin --install-dir ~/.redrob/bootstrap
redrob-bootstrap doctor --json
redrob-bootstrap install app --manifest https://example.com/redrob-install-manifest.json
redrob-bootstrap doctor --app --json
```

Current scope:

- `install` installs the lightweight CLI into a user-writable bin directory.
- `install app` downloads a manifest-selected desktop app artifact, verifies its
  SHA-256 digest, and installs it into a user-writable app directory.
  Supported artifact types: macOS `.dmg`, `.zip`, `.tar.gz`/`.tgz`, Linux
  `.AppImage`, and Windows `.exe`/`.msi` copy-installs.
- `doctor` verifies the CLI and desktop app install.

This is a bootstrap layer for install only; runtime hosting uses the desktop app
or `redrob-server`.

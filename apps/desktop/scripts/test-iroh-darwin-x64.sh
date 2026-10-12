#!/usr/bin/env bash
# Proves the Intel binding works: runs the co-working tunnel and bridge tests under an x86_64
# Node, so the loader takes the darwin-x64 path and the tests use the binary we built.
#
# On Apple silicon that Node runs under Rosetta 2; on an Intel Mac it runs natively. The tests
# skip themselves when no binding loads, so a skip counts as a failure here.
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "test-iroh-darwin-x64: needs macOS" >&2
  exit 1
fi
desktop_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(uname -m)" = "arm64" ] && ! /usr/bin/pgrep -q oahd; then
  softwareupdate --install-rosetta --agree-to-license >/dev/null
fi

# The same Node version as the job's, in its x64 build.
version="$(node -p process.version)"
node_dir="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/node-$version-darwin-x64"
if [ ! -x "$node_dir/bin/node" ]; then
  mkdir -p "$node_dir"
  curl -fsSL "https://nodejs.org/dist/$version/node-$version-darwin-x64.tar.gz" | tar -xz -C "$node_dir" --strip-components 1
fi
x64node="$node_dir/bin/node"

cd "$desktop_dir"
arch -x86_64 "$x64node" -e "if (process.arch !== 'x64') process.exit(1); require('@number0/iroh'); console.log('loaded @number0/iroh as', process.arch)"
log="$(mktemp)"
arch -x86_64 "$x64node" --test electron/cowork/http-tunnel.test.mjs electron/cowork/bridge.test.mjs 2>&1 | tee "$log"
if grep -q "is not installed for this platform" "$log"; then
  echo "test-iroh-darwin-x64: the iroh tests skipped, so the binding did not load" >&2
  exit 1
fi

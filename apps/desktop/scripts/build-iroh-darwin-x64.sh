#!/usr/bin/env bash
# Builds @number0/iroh's native binding for Intel Macs and puts it where the package looks for it.
#
# Upstream stopped publishing an x86_64-apple-darwin build at 1.0 ("infrastructure availability",
# n0-computer/iroh-ffi#260), though the Rust code still builds for it. We build the same tag the
# installed package was published from, so the JS side and the binary always match, and drop it
# beside the package's index.js as iroh.darwin-x64.node, the first path its loader tries on an
# Intel Mac. electron-builder then unpacks and signs it with the rest of node_modules/@number0.
#
# Runs on macOS (Apple silicon or Intel). Needs rustup and git. Usage, from the repo root:
#   bash apps/desktop/scripts/build-iroh-darwin-x64.sh
#
# Upgrading @number0/iroh: set IROH_VERSION and IROH_COMMIT to the new tag and its commit. The
# script refuses to build for a version it was not pinned to.
set -euo pipefail

IROH_VERSION="1.1.0"
# n0-computer/iroh-ffi tag v1.1.0. Its iroh-js sources are byte-identical to the npm package.
IROH_COMMIT="5e451092dba0c1a09ee83ff6e5be37b1152a5c58"
TARGET="x86_64-apple-darwin"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build-iroh-darwin-x64: needs macOS (the build links against the macOS SDK)" >&2
  exit 1
fi

desktop_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
package_json="$(cd "$desktop_dir" && node -p "require.resolve('@number0/iroh/package.json')")"
package_dir="$(dirname "$package_json")"
installed="$(node -p "require('$package_json').version")"
if [ "$installed" != "$IROH_VERSION" ]; then
  echo "build-iroh-darwin-x64: @number0/iroh is $installed but this script is pinned to $IROH_VERSION." >&2
  echo "Update IROH_VERSION and IROH_COMMIT to the matching iroh-ffi tag." >&2
  exit 1
fi

work="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/iroh-ffi-$IROH_COMMIT"
if [ ! -d "$work/.git" ]; then
  rm -rf "$work"
  git init -q "$work"
  git -C "$work" remote add origin https://github.com/n0-computer/iroh-ffi.git
fi
git -C "$work" fetch -q --depth 1 origin "$IROH_COMMIT"
git -C "$work" checkout -q --detach FETCH_HEAD
test "$(git -C "$work" rev-parse HEAD)" = "$IROH_COMMIT"

rustup target add "$TARGET" >/dev/null
# 10.15 is Electron's own floor for Intel Macs, so the binding loads wherever the app does.
export MACOSX_DEPLOYMENT_TARGET="${MACOSX_DEPLOYMENT_TARGET:-10.15}"
(cd "$work" && cargo build --release --locked --target "$TARGET" -p number0_iroh)

built="$work/target/$TARGET/release/libnumber0_iroh.dylib"
out="$package_dir/iroh.darwin-x64.node"
cp "$built" "$out"
chmod 0644 "$out"

arch_of="$(lipo -archs "$out")"
if [ "$arch_of" != "x86_64" ]; then
  echo "build-iroh-darwin-x64: $out is '$arch_of', not x86_64" >&2
  exit 1
fi
echo "built $out ($(wc -c < "$out") bytes, $arch_of, iroh-ffi $IROH_COMMIT)"

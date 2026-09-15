#!/usr/bin/env sh
set -eu

REDROB_WORKSPACE="${REDROB_WORKSPACE:-/workspace}"
REDROB_DATA_DIR="${REDROB_DATA_DIR:-/data/redrob-server}"
REDROB_SIDECAR_DIR="${REDROB_SIDECAR_DIR:-/data/sidecars}"
REDROB_PORT="${REDROB_PORT:-8787}"
REDROB_TOKEN="${REDROB_TOKEN:-microsandbox-token}"
REDROB_HOST_TOKEN="${REDROB_HOST_TOKEN:-microsandbox-host-token}"
REDROB_APPROVAL_MODE="${REDROB_APPROVAL_MODE:-auto}"
REDROB_CORS_ORIGINS="${REDROB_CORS_ORIGINS:-*}"
REDROB_CONNECT_HOST="${REDROB_CONNECT_HOST:-127.0.0.1}"
REDROB_EXTENSIONS_PLUGIN_DIR="${REDROB_EXTENSIONS_PLUGIN_DIR:-/opt/redrob/opencode-plugins}"
HOME="${HOME:-/root}"
USER="${USER:-root}"
SHELL="${SHELL:-/bin/sh}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"

if [ "$HOME" = "/" ]; then
  HOME=/root
  XDG_CONFIG_HOME="$HOME/.config"
  XDG_CACHE_HOME="$HOME/.cache"
  XDG_DATA_HOME="$HOME/.local/share"
  XDG_STATE_HOME="$HOME/.local/state"
fi

export HOME USER SHELL XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME XDG_STATE_HOME
export REDROB_DATA_DIR REDROB_TOKEN REDROB_HOST_TOKEN REDROB_EXTENSIONS_PLUGIN_DIR
export REDROB_MANAGE_OPENCODE=1
export REDROB_CODE_BIN=/usr/local/bin/redrob

mkdir -p "$REDROB_WORKSPACE" "$REDROB_DATA_DIR" "$REDROB_SIDECAR_DIR"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"

printf '%s\n' "Starting Redrob Cowork micro-sandbox"
printf '%s\n' "- workspace: $REDROB_WORKSPACE"
printf '%s\n' "- home: $HOME"
printf '%s\n' "- redrob url: http://$REDROB_CONNECT_HOST:$REDROB_PORT"
printf '%s\n' "- client token: $REDROB_TOKEN"
printf '%s\n' "- host token: $REDROB_HOST_TOKEN"
printf '%s\n' "- health: curl http://$REDROB_CONNECT_HOST:$REDROB_PORT/health"
printf '%s\n' "- auth test: curl -H \"Authorization: Bearer $REDROB_TOKEN\" http://$REDROB_CONNECT_HOST:$REDROB_PORT/workspaces"

exec redrob-server \
  --workspace "$REDROB_WORKSPACE" \
  --host 0.0.0.0 \
  --port "$REDROB_PORT" \
  --token "$REDROB_TOKEN" \
  --host-token "$REDROB_HOST_TOKEN" \
  --approval "$REDROB_APPROVAL_MODE" \
  --cors "$REDROB_CORS_ORIGINS" \
  --verbose

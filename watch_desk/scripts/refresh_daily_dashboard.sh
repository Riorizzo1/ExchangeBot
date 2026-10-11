#!/bin/zsh
set -euo pipefail

ROOT=/Users/bobby/.openclaw/workspace
cd "$ROOT"
NODE_BIN=/opt/homebrew/bin/node

# This is the only publisher for the Daily Delta board.  In particular, do not
# call update_live_dashboard.sh or build_v2_html.py here: both publish a
# different, full-inventory product to the same v2.html/index.html paths.
#
# Sources call this script with their name after a successful crawl.  The
# periodic LaunchAgent calls it without arguments to reconcile both sources.
typeset -a sources
if (( $# == 0 )); then
  sources=(reddit rwi)
else
  sources=("$@")
fi

for source in "${sources[@]}"; do
  if [[ "$source" != reddit && "$source" != rwi ]]; then
    print -u2 -- "usage: $0 [reddit|rwi ...]"
    exit 64
  fi
done

# The compact Daily Delta bundle gets its RWI gallery URLs through
# build_watch_desk.py's latest.json input.  That builder deliberately skips
# network image fetches on the hourly path, so refresh the browser-backed RWI
# sidecar first whenever this publish includes RWI.  Without this step the
# sidecar silently goes stale and every new RWI card renders as “no image
# captured”.
needs_rwi_images=0
for source in "${sources[@]}"; do
  if [[ "$source" == rwi ]]; then
    needs_rwi_images=1
    break
  fi
done

LOCK_DIR=/tmp/watch-desk-daily-publish.lock
while ! mkdir "$LOCK_DIR" 2>/dev/null; do
  sleep 1
done
trap 'rmdir "$LOCK_DIR" >/dev/null 2>&1 || true' EXIT

start=$SECONDS
print -- "[daily-delta] publish started (sources: ${sources[*]})"
for source in "${sources[@]}"; do
  phase_start=$SECONDS
  python3 watch_desk/scripts/update_daily_watch_dashboard.py "$source"
  print -- "[daily-delta] folded $source in $(( SECONDS - phase_start ))s"
done

phase_start=$SECONDS
if (( needs_rwi_images )); then
  "$NODE_BIN" watch_desk/scripts/extract_rwi_images.mjs
  print -- "[daily-delta] refreshed RWI image sidecar in $(( SECONDS - phase_start ))s"
fi

phase_start=$SECONDS
WATCH_DESK_SKIP_IMAGE_FETCH=1 python3 watch_desk/scripts/build_watch_desk.py
print -- "[daily-delta] refreshed compact catalog in $(( SECONDS - phase_start ))s"

phase_start=$SECONDS
python3 watch_desk/scripts/build_daily_lite.py
# Root now points to the Daily Delta product. The legacy full-inventory board
# remains at /v2.html until it is retired deliberately.
cp watch_desk/public/daily-redirect.html watch_desk/public/index.html
print -- "[daily-delta] built compact board in $(( SECONDS - phase_start ))s"

phase_start=$SECONDS
python3 watch_desk/scripts/send_watch_alerts.py
print -- "[daily-delta] evaluated push alerts in $(( SECONDS - phase_start ))s"
print -- "[daily-delta] publish completed in $(( SECONDS - start ))s"

# Image warming is deliberately detached from publishing. It fills the local,
# resized thumbnail cache for the first browsing screens, but never makes a
# successful source crawl or dashboard publish wait on a slow remote host.
WARM_LOCK=/tmp/watch-desk-thumb-warm.lock
# A detached warmer can be interrupted by a machine restart. Clear only a
# lock whose recorded worker is no longer alive.
if [[ -f "$WARM_LOCK/pid" ]] && ! kill -0 "$(<"$WARM_LOCK/pid")" 2>/dev/null; then
  rm -f "$WARM_LOCK/pid"
  rmdir "$WARM_LOCK" 2>/dev/null || true
fi
if mkdir "$WARM_LOCK" 2>/dev/null; then
  nohup zsh -c '
    echo $$ > "$1/pid"
    trap "rm -f \"$1/pid\"; rmdir \"$1\" >/dev/null 2>&1 || true" EXIT
    python3 watch_desk/scripts/warm_visible_thumbnails.py
  ' zsh "$WARM_LOCK" >> watch_desk/logs/watch-desk-thumbnail-warm.log 2>&1 &
  print -- "[daily-delta] thumbnail warming started in background"
fi

#!/usr/bin/env sh
# Build Mission Control from your folder of project notes (macOS and Linux).
# The first run asks for the folder and remembers it in .mc-folder (delete that file to pick another).
# Uses a venv inside the repo so nothing touches your main Python (standard library only, no installs).
# Relative paths in --folder and --out are read from where you run it.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ ! -x "$HERE/.venv/bin/python" ]; then
  echo "Creating .venv ..."
  python3 -m venv "$HERE/.venv"
fi
"$HERE/.venv/bin/python" "$HERE/build.py" "$@"
echo
echo "Done. Open the Mission Control.html named above in Chrome or Edge."

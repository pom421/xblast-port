#!/bin/sh
# Virtual X display -> VNC -> noVNC (http://localhost:6080/vnc.html).
set -e
export DISPLAY=:0
Xvfb :0 -screen 0 1024x768x24 -nolisten tcp &
sleep 1
x11vnc -display :0 -forever -shared -nopw -quiet -localhost &
websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
# Restart the game when it quits, so the page always shows something.
while true; do /usr/games/xblast "$@" || true; sleep 1; done

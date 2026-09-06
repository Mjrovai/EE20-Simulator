#!/bin/sh
# Rebuild download/EE20-Simulator-offline.zip (the simulator only, no PDF books).
# Run from anywhere: sh tools/make-offline-zip.sh
set -e
cd "$(dirname "$0")/.."
rm -f download/EE20-Simulator-offline.zip
rm -rf /tmp/EE20-Simulator && mkdir -p /tmp/EE20-Simulator
cp -R sim README.md LICENSE /tmp/EE20-Simulator/
find /tmp/EE20-Simulator -name .DS_Store -delete
( cd /tmp && zip -qr -X "$OLDPWD/download/EE20-Simulator-offline.zip" EE20-Simulator )
rm -rf /tmp/EE20-Simulator
ls -l download/EE20-Simulator-offline.zip

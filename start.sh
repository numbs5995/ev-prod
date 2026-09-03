#!/bin/bash
echo "Starting EV-Prod..."
python3 -m pip install -r requirements.txt -q
if command -v open >/dev/null 2>&1; then
  open "http://localhost:5000"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5000"
fi
python3 server.py

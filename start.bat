@echo off
echo Starting EV-Prod...
python -m pip install -r requirements.txt -q
start "" "http://localhost:5000"
python server.py

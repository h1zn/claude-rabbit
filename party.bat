@echo off
rem Serves the game on your local network for party mode (up to 5 players) and opens it.
rem The other players open the address printed below in their browsers.
cd /d "%~dp0"
start "" http://localhost:8870/
python serve.py 8870 --lan

@echo off
rem Serves the game on your local network for 2-player party mode and opens it.
rem The second player opens the address printed below in their browser.
cd /d "%~dp0"
start "" http://localhost:8870/
python serve.py 8870 --lan

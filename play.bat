@echo off
rem Serves the game locally and opens it in your default browser.
cd /d "%~dp0"
start "" http://localhost:8870/
python serve.py 8870

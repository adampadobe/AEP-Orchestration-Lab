@echo off
cd /d "%~dp0"
set PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PYEXE%" set PYEXE=python
echo Starting Practice Lead Promotion Tracker dashboard...
echo.
"%PYEXE%" -m pip install -r requirements.txt -q 2>nul
"%PYEXE%" -m streamlit run app.py
echo.
echo Open http://localhost:8501 in your browser if it did not open automatically.
pause

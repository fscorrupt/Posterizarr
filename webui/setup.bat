@echo off
echo.
echo 🚀 Posterizarr Web UI - Quick Setup
echo ====================================
echo.

REM Check if we're in the right directory
if not exist "..\Posterizarr.ps1" (
    echo ❌ Error: Posterizarr.ps1 not found in parent directory.
    echo Please run this script from the 'webui' directory.
    pause
    exit /b 1
)
echo ✅ Found Posterizarr.ps1
echo.

REM Check for Python using the 'py' launcher for robustness
py -3 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python 3 is not installed or 'py.exe' is not in your PATH.
    echo Please install Python 3 from python.org and ensure it's added to PATH.
    pause
    exit /b 1
)
echo ✅ Python 3 found

REM Check for Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed.
    echo Please install Node.js from nodejs.org.
    pause
    exit /b 1
)
echo ✅ Node.js found
echo.

REM --- Backend Setup ---
echo 📦 Setting up Python backend...
cd backend

echo    - Creating virtual environment in '.\venv\'...
py -3 -m venv venv
if %errorlevel% neq 0 (
    echo ❌ Failed to create virtual environment.
    pause
    exit /b 1
)

echo    - Activating virtual environment and installing dependencies...
call venv\Scripts\activate.bat && pip install -r requirements.txt
cd ..
echo ✅ Backend dependencies installed.
echo.

REM --- Frontend Setup ---
echo 📦 Installing Frontend Dependencies...
cd frontend
call npm install
cd ..
echo ✅ Frontend dependencies installed.
echo.

echo 🎉 Setup Complete!
echo.
echo 🎯 Next Steps:
echo.
echo 1. In a NEW terminal, start the frontend server:
echo    cd frontend
echo    npm run build
echo.
echo 2. In ANOTHER new terminal, start the backend server:
echo    cd backend
echo    call venv\Scripts\activate.bat
echo    python -m uvicorn main:app --host 0.0.0.0 --port 8000
echo.
echo 3. Open your browser and navigate to the address provided by the frontend server (e.g., http://localhost:8000).
echo.
pause

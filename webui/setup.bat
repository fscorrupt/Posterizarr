@echo off
echo.
echo 🚀 Posterizarr Web UI - Quick Setup
echo ====================================
echo.

REM Check if we're in the right directory
if not exist "..\Posterizarr.ps1" (
    echo ❌ Error: Posterizarr.ps1 not found in parent directory
    echo Please run this script from the webui directory
    pause
    exit /b 1
)

echo ✅ Found Posterizarr.ps1
echo.

REM Check for Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python 3 is not installed
    pause
    exit /b 1
)
echo ✅ Python found

REM Check for Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed
    pause
    exit /b 1
)
echo ✅ Node.js found



echo.
echo 📦 Installing Backend Dependencies...
cd backend
pip install -r requirements.txt
cd ..

echo.
echo 📦 Installing Frontend Dependencies...
cd frontend
call npm install
cd ..

echo.
echo ✅ Setup Complete!
echo.
echo 🎯 Next Steps:
echo.
echo 1. Start Backend (in one terminal):
echo    cd backend ^&^& python main.py
echo.
echo 2. Start Frontend (in another terminal):
echo    cd frontend ^&^& npm run dev
echo.
echo 3. Open browser at: http://localhost:3000
echo.
echo OR use Docker:
echo    docker-compose up -d
echo.
pause

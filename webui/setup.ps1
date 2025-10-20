# 🚀 Posterizarr Web UI - Quick Setup
# This script sets up the Python virtual environment for the backend
# and installs dependencies for both the frontend and backend.

Clear-Host
Write-Host ""
Write-Host "🚀 Posterizarr Web UI - Quick Setup"
Write-Host "===================================="
Write-Host ""

# Prerequisite Checks

# Check if we're in the right directory
if (-not (Test-Path "..\Posterizarr.ps1")) {
    Write-Host "❌ Error: Posterizarr.ps1 not found in parent directory." -ForegroundColor Red
    Write-Host "Please run this script from within the 'webui' directory."
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "✅ Found Posterizarr.ps1"

# Check for Python using the 'py.exe' launcher for robustness
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 is not installed or 'py.exe' is not in your PATH." -ForegroundColor Red
    Write-Host "Please install Python 3 from python.org and ensure it's added to your system PATH."
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "✅ Python 3 found"

# Check for Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js from nodejs.org."
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "✅ Node.js found"
Write-Host ""

# Backend Setup
Write-Host "📦 Setting up Python backend..."
Push-Location -Path "backend"

# Create a virtual environment if it doesn't exist
if (-not (Test-Path "venv")) {
    Write-Host "   - Creating virtual environment in '.\venv\'..."
    try {
        py -3 -m venv venv
    }
    catch {
        Write-Host "❌ Failed to create virtual environment." -ForegroundColor Red
        Pop-Location
        Read-Host "Press Enter to exit..."
        exit 1
    }
} else {
    Write-Host "   - Virtual environment already exists."
}

# Install dependencies using the virtual environment's pip
Write-Host "   - Installing Python dependencies..."
try {
    # Execute pip install directly from the venv for script simplicity
    .\venv\Scripts\pip.exe install -r requirements.txt
    Write-Host "✅ Backend dependencies installed." -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to install backend dependencies." -ForegroundColor Red
    Pop-Location
    Read-Host "Press Enter to exit..."
    exit 1
}

Pop-Location
Write-Host ""

# Frontend Setup
Write-Host "📦 Installing Frontend Dependencies..."
Push-Location -Path "frontend"
npm install
Pop-Location
Write-Host "✅ Frontend dependencies installed." -ForegroundColor Green
Write-Host ""

# --- 4. Final Instructions ---
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. In a NEW terminal, start the frontend dev server:"
Write-Host "   cd webui\frontend"
Write-Host "   npm run build"
Write-Host ""
Write-Host "2. In ANOTHER new terminal, start the backend server:"
Write-Host "   cd webui\backend"
Write-Host "   .\venv\Scripts\Activate.ps1"
Write-Host "   python -m uvicorn main:app --host 0.0.0.0 --port 8000"
Write-Host ""
Write-Host "   NOTE: If activation fails, you may need to change your execution policy for this terminal session by running:"
Write-Host "   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
Write-Host ""
Write-Host "3. Open your browser and navigate to the address provided by the frontend server (e.g., http://localhost:8000)."
Write-Host ""
Read-Host "Press Enter to close this window..."
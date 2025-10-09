# 🚀 Posterizarr Web UI - Quick Setup
Write-Host ""
Write-Host "🚀 Posterizarr Web UI - Quick Setup"
Write-Host "===================================="
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "..\Posterizarr.ps1")) {
    Write-Host "❌ Error: Posterizarr.ps1 not found in parent directory" -ForegroundColor Red
    Write-Host "Please run this script from the webui directory"
    Read-Host "Press Enter to exit..."
    exit 1
}

Write-Host "✅ Found Posterizarr.ps1"
Write-Host ""

# Check for Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python 3 is not installed" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "✅ Python found"

# Check for Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "✅ Node.js found"

Write-Host ""
Write-Host "📦 Installing Backend Dependencies..."
Set-Location backend
pip install -r requirements.txt
Set-Location ..

Write-Host ""
Write-Host "📦 Installing Frontend Dependencies..."
Set-Location frontend
npm install
Set-Location ..

Write-Host ""
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Next Steps:"
Write-Host ""
Write-Host "1. Start Backend (in one terminal):"
Write-Host "   cd backend && python main.py"
Write-Host ""
Write-Host "2. Start Frontend (in another terminal):"
Write-Host "   cd frontend && npm run dev"
Write-Host ""
Write-Host "3. Open browser at: http://localhost:3000"
Write-Host ""
Write-Host "Happy Posterizing! 🎉"
Write-Host ""

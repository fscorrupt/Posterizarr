#!/bin/bash

echo "🚀 Posterizarr Web UI - Quick Setup"
echo "===================================="
echo ""

# Check if we're in the right directory
if [ ! -f "../Posterizarr.ps1" ]; then
    echo "❌ Error: Posterizarr.ps1 not found in parent directory"
    echo "Please run this script from the webui directory"
    exit 1
fi

echo "✅ Found Posterizarr.ps1"
echo ""

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi
echo "✅ Python 3 found"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi
echo "✅ Node.js found"

# Check for PowerShell
if ! command -v pwsh &> /dev/null; then
    echo "⚠️  PowerShell not found - needed to run Posterizarr"
    echo "Continue anyway? (y/n)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✅ PowerShell found"
fi

echo ""
echo "📦 Installing Backend Dependencies..."
cd backend
pip3 install -r requirements.txt
cd ..

echo ""
echo "📦 Installing Frontend Dependencies..."
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup Complete!"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Start Frontend (in another terminal):"
echo "   cd frontend && npm run build"
echo ""
echo "2. Start Backend (in one terminal):"
echo "   cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000"
echo ""
echo "3. Open browser at: http://localhost:8000"
echo ""
echo "Happy Posterizing! 🎉"
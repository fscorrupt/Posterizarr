#!/bin/sh

# Needed unless you bring the defaults with you.
cp /app/*.png /app/config
cp /app/*.ttf /app/config

# Execute the main application
exec pwsh -File /app/Posterizarr.ps1 "$@"

#!/bin/sh
if [ -f /donate.txt ]; then cat /donate.txt; fi

# Execute the main application
exec pwsh -NoProfile -File /Start.ps1 "$@"
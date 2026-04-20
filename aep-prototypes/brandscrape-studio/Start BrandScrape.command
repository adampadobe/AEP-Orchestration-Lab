#!/bin/bash

# BrandScrape Studio - Double-click to launch
cd "$(dirname "$0")"

echo "Starting BrandScrape Studio..."
echo ""

source venv/bin/activate

# Open browser after a short delay (gives server time to start)
(sleep 2 && open "http://127.0.0.1:5000") &

# Start the Flask server
python3 app.py

#!/bin/sh
# Points adobe_ims_auth at Campaign Orchestration credentials (no secrets in this repo).
# Usage: ./scripts/with-campaign-adobe-env.sh .venv/bin/python proxy_server.py
export ADOBE_CREDENTIALS_FILE="/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AI Projects/Campaign Orchestration/01_Core_Setup_Authentication/adobe_auth/credentials.env"
exec "$@"

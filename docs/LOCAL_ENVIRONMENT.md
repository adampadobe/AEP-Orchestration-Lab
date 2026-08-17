Local environment and sensitive file handling

Purpose

This document explains where sensitive environment files were moved after the production predeploy safety check, and how to restore them for local development without committing secrets to the repository.

Backup location

The predeploy step moved sensitive files that were present under functions/ into a timestamped directory under the following base path on the machine that performed the move:

  ~/aep-orchestration-lab-env-backup/

Each run creates a timestamped child directory like:

  ~/aep-orchestration-lab-env-backup/20260817T161019/

That directory contains the original sensitive files (for example: .env.adbe-gcp0819, .env.aep-orchestration-lab, .gcloudignore, snowflake.log).

Principles

- Never commit secrets or environment files into Git. Keep them outside the repo and use Firebase Functions secrets for production where possible.
- Restore files locally only when you need to run the emulator or otherwise run functions locally.
- The helper script at scripts/restore-local-env.sh helps locate the most recent backup and interactively copy files back into functions/.

Quick manual restore (one-off)

1. Find the latest backup directory:

   ls -1t ~/aep-orchestration-lab-env-backup/ | head -1

2. Copy files back into functions/:

   cp ~/aep-orchestration-lab-env-backup/<TIMESTAMP>/.env.* functions/

3. Run the emulator or local server as needed (examples):

   cd functions && npx -y firebase-tools@latest emulators:start --only functions

4. When finished, remove the files from functions/ so they are not included in deploys:

   rm functions/.env.*

Safe interactive helper (recommended)

Use the included script scripts/restore-local-env.sh which will:

- Detect the most recent timestamped backup directory under ~/aep-orchestration-lab-env-backup/
- List the files it intends to copy
- Ask for confirmation before copying into functions/

Usage:

  # Make executable once
  chmod +x scripts/restore-local-env.sh

  # Run the script (it will use the default backup base dir)
  scripts/restore-local-env.sh

  # Or provide an explicit backup base dir
  scripts/restore-local-env.sh /path/to/backup-base

Important notes

- After restoring files for local work, remove them from functions/ when done to avoid accidental upload during any deployment.
- If you prefer not to copy files into the repo directory, update your local tooling to point at the backup path directly, or use a symlink (be aware git status may still detect symlinks).
- Consider moving long-term to Firebase Functions secrets (firebase functions:secrets) for production values.

Contact

If you want, the helper script can be extended to create temporary symlinks, automatically remove restored files after a session, or validate file contents before restoring. Reply here with which behavior you'd like next.
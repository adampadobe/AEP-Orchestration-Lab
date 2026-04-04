# Backing up this project to GitHub

**After every modification:** commit and push (see [Regular backups](#regular-backups) below) so GitHub stays your backup. Cursor is instructed to do the same when it finishes a change (see repo `.cursor/rules/git-commit-after-changes.mdc`).

**This project is not automatically backed up** by any other service. You push to GitHub from your own machine using your account — no need to "give access" to anyone else.

**Your repo:** `kirkside-bit/cursor` (private)

---

## One-time setup

### 1. Install Git (if needed)

- Download: https://git-scm.com/download/win  
- Or: `winget install Git.Git`

### 2. Authenticate to your private repo

GitHub no longer accepts account passwords for push. Use one of these:

**Option A – Personal Access Token (HTTPS, recommended)**

1. GitHub → **Settings** (your profile) → **Developer settings** → **Personal access tokens** → **Tokens (classic)**.  
2. **Generate new token (classic)**. Name it (e.g. "Cursor AEP backup"), enable **repo**, set expiry, generate.  
3. Copy the token and store it somewhere safe (you won’t see it again).

When you run `git push`, use:
- **Username:** `kirkside-bit`
- **Password:** paste the token (not your GitHub password).

To avoid typing it every time, use Git’s credential helper (Git will store it):

```powershell
git config --global credential.helper manager
```

Then the first `git push` will prompt for username and token; after that it’s cached.

**Option B – SSH key**

1. Generate a key: `ssh-keygen -t ed25519 -C "your_email@example.com"` (accept default path).  
2. Add the **public** key to GitHub: **Settings** → **SSH and GPG keys** → **New SSH key**.  
3. Use the SSH remote below instead of HTTPS.

### 3. Initialize Git and connect to GitHub

Open **PowerShell** or **Command Prompt** in this folder and run:

```powershell
cd "c:\Users\kirkham\OneDrive - Adobe\Cursor Projects\AEP Profile"

git init

# HTTPS (you'll use username kirkside-bit and your Personal Access Token when prompted)
git remote add origin https://github.com/kirkside-bit/cursor.git

# Or, if you use SSH:
# git remote add origin git@github.com:kirkside-bit/cursor.git

git add .
git commit -m "Initial backup: AEP Profile Viewer, Consent, Ingest Events, Adobe Auth"
git branch -M main
git push -u origin main
```

When you `git push`, if prompted:
- **Username:** `kirkside-bit`
- **Password:** your Personal Access Token (if using HTTPS).

## Regular backups

Whenever you want to save your work to GitHub:

```powershell
cd "c:\Users\kirkham\OneDrive - Adobe\Cursor Projects\AEP Profile"
git add .
git status
git commit -m "Describe what you changed"
git push
```

**Note:** `.env` files are in `.gitignore` and will **not** be pushed (so secrets stay local). Keep a safe copy of any important env values elsewhere.

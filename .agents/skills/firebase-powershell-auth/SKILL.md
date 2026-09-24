---
name: firebase-powershell-auth
description: Authenticate or reauthenticate the Firebase CLI for the AEP Orchestration Lab from Windows PowerShell. Use when Firebase credentials are missing, expired, invalid, or blocking project access or deployment. Never launch or control a browser for this workflow.
---

# Firebase authentication from PowerShell

Use a user-run interactive PowerShell session as the authority for Firebase authentication. Do not launch an authentication page with `Start-Process`, Codex browser tools, Chrome control, or `open_in_codex`, and do not copy an authentication URL into the conversation.

Firebase uses Google OAuth and may manage its own approval callback after the user starts the command. A successful local callback may finish without displaying an authorization code; do not treat the absence of a code as failure and do not ask the user to paste a code or token into chat.

## Workflow

1. Check state without exposing credentials:

   ```powershell
   npx -y firebase-tools@latest login:list
   npx -y firebase-tools@latest projects:list
   ```

2. If authentication is missing or invalid, ask the user to open PowerShell in the repository and run one of these themselves:

   ```powershell
   # No authorized Firebase account
   npx -y firebase-tools@latest login

   # An account is listed but its session is expired or invalid
   npx -y firebase-tools@latest login --reauth
   ```

3. Wait for the user to report that the PowerShell command completed. Do not launch or automate the approval UI. Do not use `--no-localhost` unless the user explicitly requests the link-and-code flow; that flow has failed on this workstation with `Unable to verify client`.

4. Re-run the two plain verification commands. Confirm that the intended team-authorized account is listed and that project `aep-orchestration-lab` is visible/current before any deployment.

5. If verification still fails, stop and report the exact non-secret error. Do not deploy, inspect Firebase credential files, or bypass authentication with an undocumented token.

## Security constraints

- Never run `firebase login:list --json`; it can emit access and refresh tokens.
- Never print, request, store, or paste passwords, authorization codes, access tokens, refresh tokens, ID tokens, or service-account JSON in chat or command output.
- Do not read Firebase authentication caches or credential stores.
- Do not log out or revoke another session unless the user authorizes it or credential compromise requires immediate containment.
- Service-account authentication is a separate CI/deployment design and requires owner-approved IAM and secret storage; do not invent or broaden it during interactive reauthentication.
- Successful authentication does not authorize a deployment. Apply the repository's Phase C exact-`origin/main` production gate separately.

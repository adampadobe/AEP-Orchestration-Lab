# 00 Adobe Auth

Reusable Adobe Experience Platform (AEP) / Adobe I/O OAuth helper. It gets a bearer token from Adobe IMS and **refreshes it automatically** when it expires, so any project can depend on this folder for authenticated AEP API calls.

## Security and compliance

- **Secrets are never stored in code.** Credentials come from a vault, environment variables, or (local dev only) a `.env` file.
- **`.env` is gitignored.** Copy `.env.example` to `.env` and fill in your values. Do not commit `.env`.
- **For production and compliance:** Store client ID and client secret in a **vault** (e.g. Azure Key Vault). When the vault is configured, `.env` is not loaded for secrets, so credentials are never on disk. See [Using Azure Key Vault](#using-azure-key-vault) below.
- Prefer environment variables in CI for non-secret config; inject secrets from your organisation’s vault or secrets manager.

## One-time setup

1. **Copy the example env file**
   ```bash
   cd "00 Adobe Auth"
   copy .env.example .env
   ```

2. **Fill in `.env`** with values from [Adobe Developer Console](https://developer.adobe.com/console) (your project → Service Account / OAuth):
   - `ADOBE_CLIENT_ID` – API Key (Client ID)
   - `ADOBE_CLIENT_SECRET` – Client Secret
   - `ADOBE_IMS_HOST` – e.g. `ims-na1.adobelogin.com` (North America) or `ims-eu1.adobelogin.com` (Europe)
   - `ADOBE_SCOPES` – space-separated scopes (must match your project; e.g. `openid session AdobeID read_organizations` and any AEP scopes you need)
   - `ADOBE_ORG_ID` – your org ID (e.g. `XXXXXXXX@AdobeOrg`)
   - `ADOBE_SANDBOX_NAME` – AEP sandbox name (e.g. `kirkham`)

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Verify**
   ```bash
   npm run test-auth
   ```
   You should see config and token length; no errors.

## Usage

### Get a bearer token (CLI)

From the `00 Adobe Auth` folder:

```bash
npm run token
```

Prints the current access token to stdout (useful for scripts or curl).

### Use from another project in this repo

**Option A – Relative path to this package**

```javascript
import { getAccessToken, getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

// Just the token (refreshed automatically when expired)
const token = await getAccessToken();

// Token + org/sandbox for AEP APIs
const { token, config } = await getAuth();
// config.orgId, config.sandboxName, config.technicalAccountId

// Only config (no token)
const cfg = getConfig();
```

**Option B – From project root with .env at root**

If your project has its own `package.json` at repo root, you can put a `.env` at the repo root and run from there. The loader checks both this folder and `process.cwd()` for `.env`.

### Using the token in AEP API calls

```javascript
const { getAuth, getConfig } = await import('../00 Adobe Auth/src/index.js');
const { token, config } = await getAuth();
const cfg = getConfig(); // use cfg.clientId for x-api-key if required

const res = await fetch('https://platform.adobe.io/...', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
    'x-sandbox-name': config.sandboxName,
  },
});
```

If you need `clientId` in headers, get it from `getConfig().clientId` (it’s not included in `getAuth().config` to avoid leaking it into logs).

## Behaviour

- **Caching:** The first call fetches a token from Adobe IMS and caches it in memory.
- **Refresh:** When the token is within 5 minutes of expiry (or missing), the next `getAccessToken()` or `getAuth()` call fetches a new one.
- **No secrets in repo:** All sensitive values live in `.env` or the environment; `.env` is listed in `.gitignore`.

## Mapping from Postman (e.g. EMEA Demo)

If you use the Adobe I/O OAuth Postman collection and an environment like EMEA Demo:

| Postman / Env   | .env variable       |
|-----------------|---------------------|
| API_KEY         | ADOBE_CLIENT_ID     |
| CLIENT_SECRET   | ADOBE_CLIENT_SECRET |
| IMS             | ADOBE_IMS_HOST      |
| SCOPES          | ADOBE_SCOPES        |
| ORG_ID / IMS_ORG| ADOBE_ORG_ID        |
| x-sandbox-name  | ADOBE_SANDBOX_NAME  |

Copy those values from Postman into your `.env`. **Do not commit** the Postman export or `.env` (they contain secrets).

---

## Using Azure Key Vault (recommended for compliance)

To keep client ID and client secret out of `.env` and off disk, store them in **Azure Key Vault** and point this package at the vault.

### 1. Store secrets in Azure Key Vault

In your Azure Key Vault, create two secrets (names can be overridden via env; see below):

| Secret name (default)   | Value              |
|-------------------------|--------------------|
| `ADOBE-CLIENT-ID`       | Your Adobe API Key (Client ID) |
| `ADOBE-CLIENT-SECRET`   | Your Adobe Client Secret       |

Use the Azure Portal, CLI, or your pipeline to set these; never commit them.

### 2. Grant access to the vault

Ensure the identity that runs this code (e.g. your user account for local dev, or a managed identity / service principal in production) has **Key Vault Secrets User** (or **Get** on secrets) on this Key Vault.

### 3. Configure the app to use the vault

Set these environment variables (e.g. in your shell, CI, or a non-committed env file that does **not** contain the actual secrets):

- **`AZURE_KEY_VAULT_NAME`** – Name of your Key Vault (e.g. `my-org-vault`). When this is set, client ID and client secret are **only** read from the vault; `.env` is not loaded for those values.
- **Non-secret config** – Still set via environment (or a separate config source):
  - `ADOBE_IMS_HOST` (e.g. `ims-na1.adobelogin.com`)
  - `ADOBE_SCOPES` (space- or comma-separated)
  - `ADOBE_ORG_ID`, `ADOBE_SANDBOX_NAME` (optional but needed for AEP API calls)

Optional: custom secret names in the vault:

- `AZURE_VAULT_SECRET_NAME_CLIENT_ID` – defaults to `ADOBE-CLIENT-ID`
- `AZURE_VAULT_SECRET_NAME_CLIENT_SECRET` – defaults to `ADOBE-CLIENT-SECRET`

### 4. Install Azure dependencies

```bash
npm install @azure/keyvault-secrets @azure/identity
```

Or rely on `optionalDependencies` (they will be installed with `npm install` when present).

### 5. Run as usual

```bash
npm run test-auth
npm run token
```

With `AZURE_KEY_VAULT_NAME` set, the client ID and client secret are never read from `.env` or from disk, which helps meet security and compliance requirements.

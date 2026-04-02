# Firebase tools (Storage + Hosting)

This folder contains two local tools:

1. **[Firebase Storage Images](#firebase-storage-images)** — browse Storage in the cloud and upload via drag-and-drop (client SDK).
2. **[Firebase Hosting manager](#firebase-hosting-manager-local-upload--deploy)** — copy files into your **local** Hosting `public` folder on disk, then run **`firebase deploy --only hosting`** from your machine.

---

## Firebase Hosting manager (local upload + deploy)

Use this when your site files live on disk (e.g. `C:\Users\...\firebase\firebase`) and you deploy with the Firebase CLI, as in:

`firebase deploy` → Hosting uploads files from the `public` directory defined in `firebase.json`.

### Setup

1. Install dependencies and the [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) and run `firebase login` once.

2. Copy `.env.example` to `.env` and set:

   - **`FIREBASE_PROJECT_DIR`** — folder that contains **`firebase.json`** (e.g. `C:\Users\you\OneDrive - Adobe\firebase`).
   - **`FIREBASE_HOSTING_PUBLIC`** *(optional)* — absolute path to the hosting **public** directory if you want to override `firebase.json` (e.g. `C:\Users\you\OneDrive - Adobe\firebase\firebase`).

3. Start the server:

   ```bash
   cd "Firebase Images"
   npm install
   npm start
   ```

4. Open **http://localhost:3847/hosting.html** (port configurable via `PORT` in `.env`).

### Usage

- Enter a **subfolder** relative to the hosting public root (e.g. `images` or `slides/deck1`). Dropped files are written there (overwriting same names when using **Keep names**).
- Choose a **rename mode**:
  - **Keep names** — original filenames (sanitized).
  - **Folder prefix** — `{folder-slug}-{original-base}.ext`.
  - **Folder as basename** — `{folder-slug}.ext` for a single file; multiple files become `{slug}-1.ext`, `{slug}-2.ext`, …
- Click **Firebase deploy** to run `firebase deploy --only hosting` in `FIREBASE_PROJECT_DIR`. Output appears on the page.

**Security:** This server can write files and run deploys on your PC. Run only on **localhost**; do not expose to the internet.

---

## Firebase Storage Images

A local web app to browse Firebase Storage as a folder tree and upload images via drag and drop.

## Features

- **Folder tree** – Browse all folders in your Firebase Storage bucket (root and nested).
- **Image preview** – View images in the selected folder (thumbnails).
- **Drag and drop** – Drop image files onto the drop zone to upload them to the selected folder.
- **Click to upload** – Click the drop zone to pick image files.

## Setup

### 1. Firebase project

1. Create a project in [Firebase Console](https://console.firebase.google.com/) (or use an existing one).
2. Enable **Storage** and optionally set up Security Rules (see below).
3. In **Project settings** → **Your apps**, add a web app and copy the config object.

### 2. App config

Open `firebase-config.js` and replace the placeholder values with your Firebase config:

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

### 3. Storage rules (list + upload)

Listing and uploading require **Storage rules version 2**. In Firebase Console → Storage → Rules, use at least:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;  // Restrict in production (e.g. auth)
    }
  }
}
```

Tighten the rules for production (e.g. require `request.auth != null` or path-based checks).

### 4. Run locally

The app uses ES modules and must be served over HTTP (not opened as `file://`).

**Option A – Node (npx):**

```bash
npx serve .
```

Then open **http://localhost:3000** (or the URL shown).

**Option B – VS Code Live Server**

Install the “Live Server” extension, right‑click `index.html` → “Open with Live Server”.

**Option C – Python:**

```bash
python -m http.server 8080
```

Then open **http://localhost:8080**.

## Usage

1. Open the app in your browser. It will connect to Firebase and load the folder tree.
2. Click **(root)** or any folder in the tree to select the upload target.
3. Drag image files onto the drop zone, or click it to choose files. Uploads go to the selected folder.
4. Use **Refresh** to reload the folder tree after changes.

Supported image types: JPG, PNG, GIF, WebP, BMP, SVG, ICO.

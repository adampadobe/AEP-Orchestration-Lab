import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getStorage,
  ref,
  listAll,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

// Image extensions for filtering in tree and uploads
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"]);

function isImageFile(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTS.has(ext);
}

function getFileName(path) {
  return path.replace(/\/$/, "").split("/").pop() || path;
}

// Initialize Firebase
let app;
let storage;

try {
  if (
    !firebaseConfig.apiKey ||
    firebaseConfig.apiKey === "YOUR_API_KEY"
  ) {
    throw new Error("Firebase config not set. Edit firebase-config.js with your project credentials.");
  }
  app = initializeApp(firebaseConfig);
  storage = getStorage(app);
} catch (e) {
  console.error(e);
  setAuthStatus("Error: " + e.message, false);
}

// DOM
const folderTree = document.getElementById("folder-tree");
const treeLoading = document.getElementById("tree-loading");
const treeRoot = document.getElementById("tree-root");
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const previewArea = document.getElementById("preview-area");
const previewTitle = document.getElementById("preview-title");
const previewGrid = document.getElementById("preview-grid");
const uploadProgress = document.getElementById("upload-progress");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const toast = document.getElementById("toast");
const btnRefresh = document.getElementById("btn-refresh");
const authStatusEl = document.getElementById("auth-status");

let selectedPath = "";
let treeData = [];

function setAuthStatus(message, connected) {
  authStatusEl.textContent = message;
  authStatusEl.classList.toggle("connected", !!connected);
}

function showToast(message, type = "info") {
  toast.textContent = message;
  toast.className = "toast visible " + type;
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3500);
}

async function listPrefixesAndItems(storageRef) {
  const result = await listAll(storageRef);
  return {
    prefixes: result.prefixes,
    items: result.items,
  };
}

async function buildTreeRecursive(path) {
  const storageRef = path ? ref(storage, path) : ref(storage);
  const { prefixes, items } = await listPrefixesAndItems(storageRef);
  const children = [];

  for (const prefix of prefixes) {
    const name = getFileName(prefix.fullPath);
    const child = {
      name,
      path: prefix.fullPath,
      children: await buildTreeRecursive(prefix.fullPath),
    };
    children.push(child);
  }

  return children;
}

function renderTreeNode(children, parentEl, level = 0) {
  if (!children.length) return;

  const ul = document.createElement("ul");
  ul.className = "tree-node";
  ul.setAttribute("role", "group");

  for (const node of children) {
    const li = document.createElement("li");
    li.className = "tree-node-item";
    li.setAttribute("role", "treeitem");
    li.setAttribute("aria-expanded", node.children.length ? "true" : "false");
    li.dataset.path = node.path;

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.innerHTML = node.children.length
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';

    const label = document.createElement("span");
    label.textContent = node.name || "(root)";

    li.appendChild(icon);
    li.appendChild(label);
    ul.appendChild(li);

    if (node.children.length) {
      const childContainer = document.createElement("div");
      childContainer.className = "tree-node-children";
      renderTreeNode(node.children, childContainer, level + 1);
      li.appendChild(childContainer);
    }
  }

  parentEl.appendChild(ul);
}

function selectPath(path) {
  selectedPath = path || "";
  dropZone.dataset.path = selectedPath;
  document.querySelectorAll(".tree-node-item").forEach((el) => {
    el.classList.toggle("selected", el.dataset.path === selectedPath);
  });

  const hint = dropZone.querySelector(".drop-zone-hint");
  if (selectedPath) {
    hint.textContent = "Uploading to: " + (selectedPath || "(root)");
    dropZone.classList.add("ready");
  } else {
    hint.textContent = "Select a folder in the tree first";
    dropZone.classList.remove("ready");
  }

  loadPreviewForPath(selectedPath);
}

async function loadPreviewForPath(path) {
  previewArea.classList.add("hidden");
  previewGrid.innerHTML = "";

  if (!path) return;

  const storageRef = ref(storage, path);
  let items = [];
  try {
    const result = await listAll(storageRef);
    items = result.items.filter((item) => isImageFile(getFileName(item.name)));
  } catch {
    return;
  }

  if (items.length === 0) return;

  previewTitle.textContent = `Images in ${path} (${items.length})`;
  previewArea.classList.remove("hidden");

  for (const itemRef of items.slice(0, 24)) {
    try {
      const url = await getDownloadURL(itemRef);
      const name = getFileName(itemRef.fullPath);
      const div = document.createElement("div");
      div.className = "preview-item";
      const img = document.createElement("img");
      img.src = url;
      img.alt = name;
      img.loading = "lazy";
      const span = document.createElement("span");
      span.className = "name";
      span.textContent = name;
      div.appendChild(img);
      div.appendChild(span);
      previewGrid.appendChild(div);
    } catch {
      // skip failed thumbnails
    }
  }
}

async function loadFolderTree() {
  if (!storage) return;

  treeLoading.textContent = "Loading folders…";
  treeRoot.innerHTML = "";
  treeRoot.classList.add("hidden");

  try {
    treeData = await buildTreeRecursive("");
    treeLoading.classList.add("hidden");
    treeRoot.classList.remove("hidden");

    const rootUl = document.createElement("ul");
    rootUl.className = "tree-node";
    rootUl.setAttribute("role", "group");
    const rootItem = document.createElement("li");
    rootItem.className = "tree-node-item";
    rootItem.setAttribute("role", "treeitem");
    rootItem.dataset.path = "";
    const rootIcon = document.createElement("span");
    rootIcon.className = "icon";
    rootIcon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>';
    const rootLabel = document.createElement("span");
    rootLabel.textContent = "(root)";
    rootItem.appendChild(rootIcon);
    rootItem.appendChild(rootLabel);
    rootUl.appendChild(rootItem);
    treeRoot.appendChild(rootUl);

    renderTreeNode(treeData, treeRoot);
    setAuthStatus("Connected", true);
    selectPath("");
  } catch (err) {
    const msg = err.message || "Failed to load";
    const isRulesError =
      /rules_version|disallowed|403|permission/i.test(msg);
    treeRoot.classList.add("hidden");
    treeRoot.innerHTML = "";
    treeLoading.classList.remove("hidden");
    const oldHint = treeLoading.querySelector(".tree-rules-hint");
    if (oldHint) oldHint.remove();
    treeLoading.replaceChildren(document.createTextNode(msg));
    setAuthStatus("Connection failed", false);
    showToast(msg, "error");
    if (isRulesError) {
      const hint = document.createElement("p");
      hint.className = "tree-rules-hint";
      hint.innerHTML =
        'Listing requires <strong>Storage rules version 2</strong>. In Firebase Console → Storage → Rules, set the first line to <code>rules_version = \'2\';</code> and allow read/list (e.g. <code>allow read, write: if true;</code> for testing).';
      treeLoading.appendChild(hint);
    }
  }
}

function getUploadPath(fileName) {
  const base = selectedPath ? selectedPath + "/" : "";
  return base + fileName;
}

async function uploadFile(file) {
  if (!storage) return;
  if (!isImageFile(file.name)) {
    showToast("Skipped (not an image): " + file.name, "info");
    return;
  }

  const path = getUploadPath(file.name);
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || "image/jpeg",
    });

    uploadProgress.classList.remove("hidden");
    progressText.textContent = `Uploading ${file.name}…`;

    task.on(
      "state_changed",
      (snap) => {
        const pct = (snap.bytesTransferred / snap.totalBytes) * 100;
        progressFill.style.width = pct + "%";
        progressText.textContent = `${file.name}: ${Math.round(pct)}%`;
      },
      (err) => {
        uploadProgress.classList.add("hidden");
        showToast("Upload failed: " + err.message, "error");
        reject(err);
      },
      async () => {
        progressFill.style.width = "100%";
        progressText.textContent = "Done: " + file.name;
        uploadProgress.classList.add("hidden");
        showToast("Uploaded: " + file.name, "success");
        await loadPreviewForPath(selectedPath);
        resolve();
      }
    );
  });
}

async function uploadFiles(files) {
  const imageFiles = Array.from(files).filter(isImageFile);
  if (imageFiles.length === 0) {
    showToast("No image files to upload", "info");
    return;
  }
  for (const file of imageFiles) {
    await uploadFile(file);
  }
}

// Drop zone
dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files?.length) uploadFiles(e.target.files);
  e.target.value = "";
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
});

btnRefresh.addEventListener("click", () => loadFolderTree());

// Folder tree click (delegation)
treeRoot.addEventListener("click", (e) => {
  const item = e.target.closest(".tree-node-item");
  if (item && item.dataset.path !== undefined) {
    selectPath(item.dataset.path);
  }
});

// Init
if (storage) {
  loadFolderTree();
}

"use strict";

const previewButton = document.getElementById("preview");
const fillButton = document.getElementById("fill");
const profileSelect = document.getElementById("profile");
const result = document.getElementById("result");
let approvedTabId = null;
let approvedProfileMode = null;
const profiles = new Map();

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active application tab was found.");
  return tab;
}

async function loadProfile(mode) {
  if (!profiles.has(mode)) {
    const filename = mode === "local" ? "candidate-profile.local.json" : "synthetic-profile.json";
    const response = await fetch(chrome.runtime.getURL(filename));
    if (!response.ok) throw new Error(`The ${mode} profile is unavailable.`);
    profiles.set(mode, await response.json());
  }
  return profiles.get(mode);
}

async function inject(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "content.js"] });
}

async function send(type) {
  const tab = await activeTab();
  await inject(tab.id);
  const mode = profileSelect.value;
  const profile = await loadProfile(mode);
  const response = await chrome.tabs.sendMessage(tab.id, { type, profile });
  if (!response || !response.ok) throw new Error(response?.error || "The page did not accept the request.");
  return { tab, response, mode };
}

function render(response) {
  const summary = response.summary;
  result.textContent = [
    `Mode: ${response.mode}`,
    `Profile: ${profileSelect.value}`,
    `Safe fields: ${summary.fillable}`,
    `Needs review: ${summary.review}`,
    `Blocked: ${summary.blocked}`,
    response.mode === "fill" ? `Filled: ${response.filled}` : "Nothing has been changed yet.",
    "Final submission is not available in this extension."
  ].join("\n");
}

previewButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  approvedTabId = null;
  approvedProfileMode = null;
  result.textContent = "Checking fields…";
  try {
    const { tab, response, mode } = await send("PREVIEW");
    render(response);
    approvedTabId = tab.id;
    approvedProfileMode = mode;
    fillButton.disabled = response.summary.fillable === 0;
  } catch (error) {
    result.textContent = error.message;
  }
});

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  result.textContent = "Filling the fields from the preview…";
  try {
    const tab = await activeTab();
    if (tab.id !== approvedTabId) throw new Error("The active tab changed. Preview this page again before filling.");
    if (profileSelect.value !== approvedProfileMode) throw new Error("The profile changed. Preview this page again before filling.");
    const { response } = await send("FILL");
    render(response);
  } catch (error) {
    result.textContent = error.message;
  }
});

profileSelect.addEventListener("change", () => {
  approvedTabId = null;
  approvedProfileMode = null;
  fillButton.disabled = true;
  result.textContent = "Profile changed. Preview the application again before filling.";
});

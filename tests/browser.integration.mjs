import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(here, "..");
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-helper-browser-"));

const hosts = [
  "boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com"
];

function syntheticForm(variant) {
  const middle = variant % 2 === 0
    ? '<input name="phone" aria-label="Mobile phone"><input name="city" aria-label="City">'
    : '<textarea name="linkedin_profile" aria-label="LinkedIn profile"></textarea><input name="zip" aria-label="Postal code">';
  return `<!doctype html>
    <html><body>
      <form id="application">
        <label>First name <input name="first_name"></label>
        <label>Last name <input name="last_name"></label>
        <label>Email <input name="email" type="email"></label>
        ${middle}
        <label>Race / ethnicity <input name="race"></label>
        <label>Gender <input name="gender"></label>
        <label>I certify this is accurate <input name="certification" type="checkbox"></label>
        <label>Resume <input name="resume" type="file"></label>
        <label>Unknown essay <textarea name="essay"></textarea></label>
        <input name="tracking" type="hidden" value="keep">
        <button id="submit" type="submit">Submit application</button>
      </form>
      <script>
        window.__submitted = false;
        document.getElementById("application").addEventListener("submit", (event) => {
          event.preventDefault();
          window.__submitted = true;
        });
      </script>
    </body></html>`;
}

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) serviceWorker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(serviceWorker.url()).host;
  assert.match(extensionId, /^[a-p]{32}$/);

  const target = context.pages()[0] || await context.newPage();
  await target.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (hosts.includes(url.hostname)) {
      const variant = Number(url.pathname.split("/").pop()) || 1;
      await route.fulfill({ status: 200, contentType: "text/html", body: syntheticForm(variant) });
    } else {
      await route.abort();
    }
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  let completed = 0;
  for (const host of hosts) {
    for (let variant = 1; variant <= 10; variant += 1) {
      await target.goto(`https://${host}/synthetic/application/${variant}`);
      await target.bringToFront();

      await popup.evaluate(() => document.getElementById("preview").click());
      await popup.locator("#result").filter({ hasText: "Mode: preview" }).waitFor({ timeout: 5000 });

      const unchanged = await target.evaluate(() => ({
        first: document.querySelector('[name="first_name"]').value,
        email: document.querySelector('[name="email"]').value,
        submitted: window.__submitted
      }));
      assert.deepEqual(unchanged, { first: "", email: "", submitted: false });

      await popup.evaluate(() => document.getElementById("fill").click());
      await popup.locator("#result").filter({ hasText: "Mode: fill" }).waitFor({ timeout: 5000 });

      const state = await target.evaluate(() => ({
        first: document.querySelector('[name="first_name"]').value,
        last: document.querySelector('[name="last_name"]').value,
        email: document.querySelector('[name="email"]').value,
        race: document.querySelector('[name="race"]').value,
        gender: document.querySelector('[name="gender"]').value,
        certification: document.querySelector('[name="certification"]').checked,
        essay: document.querySelector('[name="essay"]').value,
        hidden: document.querySelector('[name="tracking"]').value,
        submitted: window.__submitted
      }));
      assert.deepEqual(state, {
        first: "Avery",
        last: "Candidate",
        email: "avery.candidate@example.invalid",
        race: "",
        gender: "",
        certification: false,
        essay: "",
        hidden: "keep",
        submitted: false
      });
      completed += 1;
    }
  }

  const denied = await context.newPage();
  await denied.route("**/*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: syntheticForm(1) }));
  await denied.goto("https://example.com/synthetic/application/1");
  await denied.bringToFront();
  await popup.evaluate(() => document.getElementById("preview").click());
  await popup.locator("#result").filter({ hasText: /outside|Cannot access|permission|request/i }).waitFor({ timeout: 5000 });
  assert.equal(await denied.locator('[name="first_name"]').inputValue(), "");
  assert.equal(await denied.evaluate(() => window.__submitted), false);

  console.log(JSON.stringify({
    result: "passed",
    syntheticPages: completed,
    atsFamilies: hosts.length,
    outsideAllowlistBlocked: true,
    submissionsTriggered: 0
  }, null, 2));
} finally {
  if (context) await context.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
}

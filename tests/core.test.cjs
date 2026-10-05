const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require(path.join(__dirname, "..", "core.js"));

function element({ tagName = "INPUT", type = "text", name = "", id = "", placeholder = "", aria = "", label = "", options = [] } = {}) {
  const attributes = { name, id, placeholder, "aria-label": aria };
  return {
    tagName,
    type,
    value: "",
    checked: false,
    options,
    labels: label ? [{ textContent: label }] : [],
    getAttribute(key) { return attributes[key] || ""; },
    dispatchEvent() {}
  };
}

assert.equal(core.isAllowedUrl("https://boards.greenhouse.io/example/jobs/123"), true);
assert.equal(core.isAllowedUrl("https://jobs.lever.co/example/123"), true);
assert.equal(core.isAllowedUrl("https://evil.example/boards.greenhouse.io"), false);
assert.equal(core.isAllowedUrl("http://boards.greenhouse.io/example"), false);

assert.deepEqual(core.classifyElement(element({ type: "submit", name: "submit" })).reason, "forbidden_control");
assert.deepEqual(core.classifyElement(element({ type: "file", label: "Resume" })).reason, "forbidden_control");
assert.deepEqual(core.classifyElement(element({ label: "Race / ethnicity" })).reason, "protected_or_sensitive");
assert.deepEqual(core.classifyElement(element({ label: "I certify this is accurate" })).reason, "legal_attestation");
assert.deepEqual(core.classifyElement(element({ label: "reCAPTCHA" })).reason, "captcha");
assert.deepEqual(core.classifyElement(element({ label: "Will you now or in the future require visa sponsorship?" })).reason, "eligibility_requires_review");

const fields = [
  element({ name: "first_name", label: "First name" }),
  element({ name: "email", label: "Email" }),
  element({ type: "submit", name: "submit_application" }),
  element({ name: "gender", label: "Gender" }),
  element({ name: "cover_letter", label: "Why are you interested?" })
];
const plan = core.buildPlan(fields, { first_name: "Avery", email: "avery@example.invalid" });
assert.deepEqual(core.summarize(plan), { fillable: 2, review: 1, blocked: 2 });
const applied = core.applyPlan(fields, plan);
assert.equal(applied.filled, 2);
assert.equal(fields[0].value, "Avery");
assert.equal(fields[1].value, "avery@example.invalid");
assert.equal(fields[2].value, "");
assert.equal(fields[3].value, "");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
assert.deepEqual(manifest.permissions, ["scripting"]);
assert.deepEqual(manifest.host_permissions.sort(), [
  "https://boards.greenhouse.io/*",
  "https://job-boards.greenhouse.io/*",
  "https://jobs.ashbyhq.com/*",
  "https://jobs.lever.co/*"
]);

for (const filename of ["background.js", "core.js", "content.js", "popup.js"]) {
  const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
  assert.equal(/\.click\s*\(/.test(source), false, `${filename} must never programmatically click a control`);
  assert.equal(/fetch\s*\(\s*["']https?:\/\//.test(source), false, `${filename} must not call a remote service`);
}

console.log("form-filler safety tests: passed");

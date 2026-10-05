(function (root, factory) {
  const api = factory();
  root.HardenedFillerCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ALLOWED_HOSTS = new Set([
    "boards.greenhouse.io",
    "job-boards.greenhouse.io",
    "jobs.lever.co",
    "jobs.ashbyhq.com"
  ]);

  const FORBIDDEN_TYPES = new Set(["button", "submit", "image", "file", "password", "hidden", "reset"]);
  const SENSITIVE_PATTERN = /\b(race|ethnic|hispanic|latino|gender|sex|disab|veteran|military|religion|age|date of birth|birth date|social security|ssn)\b/i;
  const LEGAL_PATTERN = /\b(certif|attest|signature|terms|privacy policy|arbitration|background check|drug test|truthful|accurate|acknowledge)\b/i;
  const CAPTCHA_PATTERN = /\b(captcha|recaptcha|human verification|not a robot)\b/i;
  const ELIGIBILITY_PATTERN = /\b(authori[sz]ed|legally eligible).*(work|employment)\b|\bwork authorization\b|\b(sponsor|sponsorship|visa)\b/i;

  const FIELD_RULES = [
    ["full_name", /\bfull\s*name\b|\blegal\b.*\bname\b|^name$/i],
    ["first_name", /\b(first|given)\s*name\b/i],
    ["last_name", /\b(last|family|sur)\s*name\b/i],
    ["email", /\be-?mail\b/i],
    ["phone", /\b(phone|mobile|telephone)\b/i],
    ["linkedin", /\blinkedin\b/i],
    ["github", /\bgithub\b/i],
    ["street_address", /\b(street address|address line 1|address 1)\b/i],
    ["city", /^city\b|\bcity$/i],
    ["state", /\b(state|province)\b/i],
    ["postal_code", /\b(zip|postal)\b/i],
    ["country", /\bcountry\b/i],
    ["relocation", /\b(relocat|willing to move)\b/i],
    ["current_company", /\bcurrent (company|employer)\b/i],
    ["current_title", /\bcurrent (job )?title\b/i],
    ["school", /\b(school|university|college)\b/i],
    ["degree", /^degree\b|\bdegree type\b/i],
    ["field_of_study", /\b(field|area) of study\b|\bmajor\b/i]
  ];

  function normalize(value) {
    return String(value || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function isAllowedUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  function descriptor(element) {
    const labels = element.labels ? Array.from(element.labels).map((item) => item.textContent || "") : [];
    return normalize([
      element.getAttribute && element.getAttribute("aria-label"),
      element.getAttribute && element.getAttribute("name"),
      element.getAttribute && element.getAttribute("id"),
      element.getAttribute && element.getAttribute("placeholder"),
      ...labels
    ].filter(Boolean).join(" "));
  }

  function classifyElement(element) {
    const tag = String(element.tagName || "").toLowerCase();
    const type = String(element.type || "text").toLowerCase();
    const text = descriptor(element);

    if (!new Set(["input", "select", "textarea"]).has(tag)) return { status: "blocked", reason: "unsupported_control" };
    if (FORBIDDEN_TYPES.has(type)) return { status: "blocked", reason: "forbidden_control" };
    if (type === "checkbox" || type === "radio") return { status: "review", reason: "choice_requires_review", descriptor: text };
    if (CAPTCHA_PATTERN.test(text)) return { status: "blocked", reason: "captcha" };
    if (SENSITIVE_PATTERN.test(text)) return { status: "blocked", reason: "protected_or_sensitive" };
    if (LEGAL_PATTERN.test(text)) return { status: "blocked", reason: "legal_attestation" };
    if (ELIGIBILITY_PATTERN.test(text)) return { status: "review", reason: "eligibility_requires_review", descriptor: text };

    for (const [key, pattern] of FIELD_RULES) {
      if (pattern.test(text)) return { status: "fillable", key, descriptor: text };
    }
    return { status: "review", reason: "unmapped", descriptor: text };
  }

  function buildPlan(elements, profile) {
    return Array.from(elements).map((element, index) => {
      const classification = classifyElement(element);
      if (classification.status !== "fillable") return { index, ...classification };
      const value = profile[classification.key];
      if (value === undefined || value === null || value === "") {
        return { index, status: "review", reason: "missing_saved_answer", key: classification.key, descriptor: classification.descriptor };
      }
      return { index, status: "fillable", key: classification.key, value, descriptor: classification.descriptor };
    });
  }

  function setNativeValue(element, value) {
    const tag = String(element.tagName || "").toLowerCase();
    const type = String(element.type || "").toLowerCase();

    if (tag === "select") {
      const wanted = normalize(value).toLowerCase();
      const option = Array.from(element.options || []).find((item) =>
        normalize(item.value).toLowerCase() === wanted || normalize(item.textContent).toLowerCase() === wanted
      );
      if (!option) return false;
      element.value = option.value;
    } else if (type === "checkbox" || type === "radio") {
      if (typeof value !== "boolean") return false;
      element.checked = value;
    } else {
      element.value = String(value);
    }

    if (typeof element.dispatchEvent === "function" && typeof Event === "function") {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  function applyPlan(elements, plan) {
    let filled = 0;
    const failures = [];
    for (const item of plan) {
      if (item.status !== "fillable") continue;
      const element = elements[item.index];
      if (!element || !setNativeValue(element, item.value)) failures.push({ ...item, reason: "value_not_accepted" });
      else filled += 1;
    }
    return { filled, failures };
  }

  function summarize(plan) {
    return plan.reduce((result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      return result;
    }, { fillable: 0, review: 0, blocked: 0 });
  }

  return { ALLOWED_HOSTS, isAllowedUrl, descriptor, classifyElement, buildPlan, applyPlan, summarize };
});

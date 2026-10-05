(function () {
  "use strict";

  if (globalThis.__LOCAL_JOB_HELPER_LISTENER__) return;
  globalThis.__LOCAL_JOB_HELPER_LISTENER__ = true;

  function controls() {
    return Array.from(document.querySelectorAll("input, select, textarea"));
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !["PREVIEW", "FILL"].includes(message.type)) return false;
    if (!globalThis.HardenedFillerCore.isAllowedUrl(location.href)) {
      sendResponse({ ok: false, error: "This page is outside the reviewed ATS allowlist." });
      return false;
    }

    const elements = controls();
    const plan = globalThis.HardenedFillerCore.buildPlan(elements, message.profile || {});
    const summary = globalThis.HardenedFillerCore.summarize(plan);
    const fields = plan.map(({ value: _value, ...safe }) => safe);

    if (message.type === "PREVIEW") {
      sendResponse({ ok: true, mode: "preview", summary, fields });
      return false;
    }

    const result = globalThis.HardenedFillerCore.applyPlan(elements, plan);
    sendResponse({ ok: true, mode: "fill", summary, filled: result.filled, failures: result.failures.length, fields });
    return false;
  });
})();

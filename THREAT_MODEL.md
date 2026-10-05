# Threat Model

This document records the security boundary of the initial Safe Application Prefill pilot.

## Assets

- Candidate contact and address information stored in `candidate-profile.local.json`
- Values shown on an employer's application form
- The user's final decision to submit an application

## Trust boundaries

- The local extension source is trusted only after review.
- Greenhouse, Lever, Ashby, and employer-authored forms are untrusted inputs.
- Fields and labels can change without notice.
- No remote service, analytics system, or model provider is trusted with candidate data.

## Primary risks and controls

| Risk | Control |
| --- | --- |
| Filling a malicious look-alike page | HTTPS plus exact-host allowlist |
| Submitting without approval | Submit-like controls are blocked; source tests reject programmatic `.click()` calls |
| Filling protected demographic data | Sensitive-label classifier blocks the field |
| Guessing an immigration or sponsorship answer | Eligibility questions are always left for manual review |
| Accepting a legal statement | Certification, signature, and acknowledgement wording is blocked |
| Uploading the wrong file | File controls are never filled |
| Reusing stale approval on another page | Changing the active tab or profile invalidates approval |
| Exfiltrating profile data | No remote API, telemetry, analytics, or credential code |
| Unexpected field behavior | Unknown questions fail closed as review items |

## Out of scope

- Compromise of the browser, operating system, or employer site
- A malicious locally installed extension with broader permissions
- User-provided profile values that are inaccurate or outdated
- Automated final submission, recruiter messaging, or account authentication

## Residual risk

An allowed employer page can label a field ambiguously or change its structure. The user must inspect every populated value before manually submitting. This pilot should run in a dedicated browser profile and remain disabled outside application sessions.

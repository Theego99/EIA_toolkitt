# Release verification

Verified on Windows with Node 24 and the in-app Chromium browser, 11–12 September 2026.

| Check | Result |
|---|---|
| Lint, production build | Passed |
| Automated regression suite | 22 tests passed, including real PostgreSQL policy/RPC tests and simulated cloud failure/race cases |
| Production dependency audit | Zero reported vulnerabilities |
| Supabase rollout | Private recovery snapshot created; additive migration applied; all six pre-existing project rows retained unchanged |
| Live database transaction test | Authenticated project create, server audit, stale version rejection and profile role escalation rejection passed; every test write rolled back |
| Existing account diagnosis | One historical account has no organization; company assignment requires owner clarification; it is not granted another company's data automatically |
| Task workflow | Note save/reload, review submission, self-approval rejection and independent demo review exercised |
| Field data | Kana species suggestions, selection provenance, observation, multiple attachments, measurement save/edit, scope selection and stakeholder response exercised |
| Reports | Actual Word files and evidence ZIPs downloaded; saved report version rendered and visually inspected; originals and source snapshot included |
| Offline release build | App server stopped; cached app reloaded; a note and PNG attachment saved; another reload retained both; Word, evidence ZIP and report preview worked without the app server |
| Responsive layout | Dashboard visually checked in a 390 × 844 iframe; this does not substitute for actual phone/tablet acceptance |
| Distribution contents | Build allowlist contains only app assets, icons, manifest and workers; local QA pages/scripts are excluded |

The outage test found a real `Vary: Origin` cache miss for JavaScript modules. The worker now matches invariant, allowlisted public assets independently of that header. An added regression test covers it. Supabase and other origins still bypass that cache.

Outstanding launch acceptance: log in through the actual application with two real company accounts; verify authenticated uploads/downloads and cross-device sync; perform the airplane-mode/close/reopen test on the intended field devices; confirm authentication email/redirect delivery; complete credential rotation, independent backups/restore, customer contract/support arrangements and a Japanese EIA specialist's review of the pilot project's applicable requirements and final report. These are launch gates, not features claimed to have passed here.

Use [RELEASE.md](RELEASE.md) for the supported workflow, limits and three-day pilot acceptance plan. No zero-defect, legal-compliance, SLA or sales-value guarantee is made by this verification record.

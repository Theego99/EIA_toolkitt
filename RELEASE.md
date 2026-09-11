# Wildpass — release candidate, 11 September 2026

Wildpass is a Japanese EIA project workspace for a supervised customer pilot. It connects work instructions, field observations, measurements, evidence, independent review, stakeholder responses and editable Word outputs. It does not certify an EIA's legal sufficiency or replace the required professional assessment, predictions, authority consultation or submission process.

## Intended company workflow

1. The project manager creates the project and records the applicable national procedure, local ordinances, project scale, permits and authority consultation under **法令・手続**. The date and person recording that decision are retained. Template tasks that do not apply need a reason in the task record and review.
2. Assign each survey task, due date and instructions under **工程・業務**. Record selection and non-selection reasons, methods, standards and editions under **法令・手続**. Keep plans and authority correspondence as evidence attached to the relevant task.
3. Before visiting the field, log in on the device, synchronize and choose **同期・保管 → オフライン用に準備**. Confirm originals have downloaded. Export a backup when working without reliable connectivity. First-time login requires a connection.
4. Surveyors save observations and measurements against a task. Species suggestions show up to five candidates and retain the selected national source/year/category. Add photographs, original documents, instrument and calibration details. Position capture requires the device's location permission; species presence and identification remain human observations.
5. Saved records remain on that browser/device. Open the app when connectivity returns. **端末保存** and **共有済み** are different states. Failed uploads stay pending. Competing edits to one field stop synchronization until someone compares both versions; independent changes merge.
6. Submit documented work for review. A different authorized reviewer must enter a reason before approving it. Changing the task's result or linked observations, measurements or evidence invalidates its approval. Shared approvals are checked on the server.
7. Record each received opinion, owner, response and reference to the resulting chapter/evidence under **意見対応**. Edit the report narrative under **報告書**. Generate Word, inspect the saved version, and download the evidence ZIP. Word contains text, records, supported photographs and the evidence register; ZIP also contains every original attachment and the source snapshot.
8. An administrator permits new member registration, changes roles and suspends cloud access. No invitation email is sent automatically. Suspension cannot erase copies already downloaded to an employee's device; company device procedures must handle those.

## What is automated and what still needs a professional decision

| Area | Release behavior | Human decision |
|---|---|---|
| Applicability | Stores route, classification, location, scale, basis, ordinance and permits; date-sensitive solar/wind scale references | Confirm actual project/changes, transitional provisions, local rules and authority determination |
| Procedure dates | Saves public notice and receipt dates; general procedure reference calculations use a calendar month and relevant receipt anchors | Confirm announced dates, legal counting/holidays and special procedures |
| Technical survey design | Saves selection/non-selection reasons, activity, methods and adopted standard/version | Choose appropriate seasons, effort, instruments, locations, model assumptions and applicable assessment criteria |
| Species | Searches 3,351 source records from all nine supplied CSV files, including plants/fungi 2025, birds/herpetofauna 2026 and mammals 2020 | Confirm identification, other taxonomic groups, prefectural lists, legal protection and collection permits |
| Evidence | Task/observation links, author/time, immutable originals, SHA-256 and retained report versions | Collect sufficient defensible evidence and verify the interpretation |
| Reporting | Real editable Word; original evidence ZIP; saved chapters, measurements, responses and revisions | Complete all required content, correct format, models, maps, disclosure/redaction and authority submission |

The supplied CSV files are not every Japanese species or every prefectural Red List. Missing matches are **unassessed**, never automatically LC. A Red List category is not itself a legal capture/protection designation. This follows the Ministry's explanation: https://www.env.go.jp/nature/kisho/hozen/redlist/ .

Sources used to correct the previous fixed legal assumptions:

- EIA Act: https://laws.e-gov.go.jp/law/409AC0000000081/20260401_507AC0000000073
- Enforcement Order: https://laws.e-gov.go.jp/law/409CO0000000346
- Governor opinion periods and receipt anchors: https://www.env.go.jp/hourei/19/000011.html
- Solar thresholds, effective 1 April 2027, with transitions: https://www.env.go.jp/press/press_05279.html
- Wind thresholds: https://www.env.go.jp/press/110033.html
- Low-frequency reference values and wind limitations: https://www.env.go.jp/air/teishuha/qa/index.html
- Electricity procedure reference: https://www.meti.go.jp/policy/safety_security/industrial_safety/sangyo/electric/files/1507chapter_one.pdf

## Engineering and recovery

The release entry is `webapp/src/WorkspaceApp.jsx`. Historical `App.jsx` and legacy libraries remain for reference, but the release does not import them. Each account/organization has a separate IndexedDB database. Mutations and attached blobs commit locally before success is shown. Synchronization uses project versions and a server RPC, uploads and verifies originals before acknowledging metadata, and does not discard failed retries. The background queue runs while the app is open; it is not a guaranteed background transfer service after closing the browser.

Only same-organization authenticated users can read shared data. Editing/reviewing roles and suspension are checked on the server. Profiles cannot self-edit their organization, role or suspension. Project audit and membership audit rows are read-only to clients. Evidence is in the private `workspace-evidence` bucket; client updates/deletes are forbidden. Public assets contain only a publishable Supabase key, never an administrative key or project records. No analytics, AI service or external identification service receives field records from this release.

The service worker precaches the complete hashed release, including the report renderer, and never caches Supabase responses. Both the former worker path and the new path serve the replacement worker. Users are prompted before activating an update. Browser storage can be cleared or evicted: it is not a substitute for company backups.

Limits: 50 MB per attachment and Word original; 200 MB evidence ZIP input; 190 MB of local originals per browser backup. Backups restore to the same account and organization. Larger deployments need a server export/retention strategy. Existing records, attachments and versions are retained instead of exposing a destructive delete button. There is no SSO/SCIM, customer-managed encryption, remote device wipe, SLA, automated billing, legally qualified electronic signature, species identification AI or prediction simulator in this release.

For deployment, run the private snapshot script `webapp/migrations/20260911_backup.sql` and then `webapp/migrations/20260911_workspace.sql` in the authenticated Supabase SQL editor. The migration is additive and transactional. The snapshot includes existing projects, profiles, organizations, legacy child records and old definitions in a private schema with no client access. It is a same-database recovery copy, not offsite backup/PITR. Coordinate old-client replacement with permission hardening; the old direct-write client cannot save after this migration. Never roll back only the frontend to the legacy app.

The old browser cache remains available to **同期・保管 → 旧版の端末データを確認・復旧**. Known-organization records and pending blobs can be copied; both old and new versions are retained for comparison. Nothing is silently imported from another organization. Existing old files that never reached cloud storage need their original device or reattachment.

Development: Node 24, `npm ci`, `npm run lint`, `npm test`, `npm run build` in `webapp`. GitHub Pages builds use `VITE_BASE=/EIA_toolkitt/`. CI performs lint, functional/storage/PostgreSQL tests, dependency audit and build before deployment. The tests use a real embedded PostgreSQL engine for permission/RPC checks and a simulated cloud client for race/failure tests; they are not a substitute for live browser authentication testing.

## Three-day customer pilot acceptance

Before presenting this as production enterprise software, complete these named checks:

| Day | Owner | Acceptance evidence |
|---|---|---|
| 1 | Product owner + two real company users | Log in with both roles; create a pilot project; upload/download a photo and document; observe sync on the second device; submit and independently approve a task; download the same stored Word version from both accounts |
| 1 | Field lead | On the actual phone/tablet, prepare offline data, enable airplane mode, reload, record notes/photos/measurements, close/reopen, reconnect and confirm every record and byte on the second device; test a deliberately conflicting edit |
| 2 | Japanese EIA specialist + pilot project manager | Confirm one real project's national/ordinance route, technical requirements, species sources/permits, dates and submission format against current official sources; inspect every generated chapter and redactions |
| 2 | Operations owner | Choose and fund appropriate hosted backup/availability arrangements, conduct an independent restore drill, define retention/access/offboarding and support escalation; configure and test authentication email delivery and allowed redirect URLs |
| 3 | Sales + pilot sponsor | Sign a scoped paid-pilot agreement with support contact, limitations and acceptance criteria; time the prior versus new workflow; review actual output and obtain customer sign-off |

At ¥400,000/year, a customer saves the subscription cost after 80 hours/year if their fully loaded time costs ¥5,000/hour. At ¥20,000/project the same illustration is four hours/project. These are transparent assumptions for measuring pilot value, not validated savings or a revenue guarantee. Sell demonstrated evidence preparation, coordination and traceability improvements; do not promise automatic legal approval or error-free operation.

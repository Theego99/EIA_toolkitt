# Wildpass

Japanese environmental assessment workspace: project tasks, field records, evidence, team review, stakeholder responses and editable Word reports.

- **Web application:** `webapp/` — React + Vite, Supabase and offline browser storage.
- **Live app:** https://theego99.github.io/EIA_toolkitt/
- **Workflow, deployment and pilot acceptance:** [RELEASE.md](RELEASE.md)
- **Historical Flutter project:** `eia_toolkit/` — not part of the current web release.

Use Node 24. In `webapp`, run `npm ci`, `npm run dev`. Release checks: `npm run lint`, `npm test`, `npm run build`.

The app supports professional EIA work; it does not automatically certify legal compliance, identify species or perform impact prediction models. Review the current pilot acceptance requirements before selling production commitments.

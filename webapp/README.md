# Wildpass web application

React + Vite frontend with Supabase authentication/private storage and durable offline browser records.

See [the release guide](../RELEASE.md) for the company workflow, migration, test coverage and pilot acceptance requirements. The active entry is `src/WorkspaceApp.jsx`; `src/App.jsx` is historical.

Use Node 24:

```text
npm ci
npm run dev
npm run lint
npm test
npm run build
```

GitHub Pages uses `VITE_BASE=/EIA_toolkitt/`. Do not place service-role keys or database passwords in environment variables exposed to Vite.

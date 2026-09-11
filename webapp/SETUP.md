# Wildpass backend setup

The current release instructions, migration sequence, supported workflows and acceptance checks are in [RELEASE.md](../RELEASE.md).

For the existing Supabase project:

1. Preserve a private snapshot with `migrations/20260911_backup.sql`.
2. Apply `migrations/20260911_workspace.sql` in the authenticated SQL editor.
3. Deploy the matching web release. Do not use the old direct-write client after permissions are hardened.
4. Configure authentication site/redirect URLs for the published origin; test real account login, confirmation and recovery email delivery.
5. Complete the two-user, real-device offline, report and backup acceptance checks in the release guide.

The browser uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (a publishable key is supported). Administrative/service keys and database passwords must never be committed or supplied to the browser.

This version generates Word reports on the device and stores immutable originals privately. It does not need the historical Lambda report generator. No secrets belong in this setup guide.

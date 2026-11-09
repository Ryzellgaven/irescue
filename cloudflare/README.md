# Cloudflare Workers + D1 pilot

The Worker now covers the API actions used by the current PHP backend, including authentication, report workflows, operations reads and writes, notifications, user administration, evacuation centers, IoT devices/readings, and admin tools. This is still a pilot: it needs a successful production build and an end-to-end Cloudflare test before public use.

## Current foundation

- One Worker serves the Vite static assets and same-origin `/api/*` requests.
- D1 schema and first migration live under `migrations/`.
- Database-backed HTTP-only sessions, CSRF tokens, PBKDF2 password hashes, resident registration, sign-in/out, profile reads/updates, emergency reports, assignments, status history, safe routes, photo upload/delivery, dashboards, users, locations, centers, notifications, caller logs, IoT readings, analytics, audit logs, and system configuration are implemented.
- `report-media` currently stores private photos in D1 and limits them to 1 MB on the free pilot.
- SMS, email, and push notifications are recorded as failed until a delivery provider is configured; in-app notifications work.
- The original PHP backend remains in `xampp/` for reference and local development. Its MySQL database contents are not automatically copied to D1.

## Cloudflare setup

These commands require Node.js and pnpm, neither of which was available in the development environment when this pilot was prepared.

1. Sign in to Cloudflare and create a D1 database: `pnpm dlx wrangler d1 create ldrrmo-emergency-response`.
2. Copy the assigned database ID into `wrangler.jsonc`. Never commit API tokens or other secrets.
3. Apply the schema: `pnpm dlx wrangler d1 migrations apply ldrrmo-emergency-response --remote`.
4. Build and deploy: `pnpm install --frozen-lockfile`, `pnpm build`, then `pnpm dlx wrangler deploy`. Configure a Cloudflare Git build to run these commands on the `cloudflare-d1-pilot-foundation` branch after the database ID is set.
5. Generate a unique, temporary bootstrap secret (at least 32 characters) and add it as the Worker secret `BOOTSTRAP_ADMIN_TOKEN`. Call `POST /api/index.php?action=bootstrap-admin` once with the `X-Admin-Bootstrap-Token` header and a JSON body containing `full_name`, `email`, and `password`. Then immediately delete the Worker secret with `pnpm dlx wrangler secret delete BOOTSTRAP_ADMIN_TOKEN`. Never put the secret in frontend code, browser storage, or a committed file.
6. Verify `/api/index.php?action=health`, then exercise resident registration, sign-in/out, CSRF-protected requests, every operations/admin workflow, media upload, notification behavior, database persistence after redeploy, and recovery procedures before considering even a limited pilot.

This migration starts with a new D1 database; it does not migrate MySQL user accounts, password hashes, incidents, sensor data, or other existing records.

Cloudflare's free usage limits do not provide an uptime, backup, recovery, privacy, or emergency-response guarantee. Do not use this deployment for real dispatch, sensitive resident data, or public emergency instructions without formal organizational approval and operational safeguards.
Cloudflare Builds: production branch cloudflare-d1-pilot-foundation; build command pnpm run build; deploy command npx wrangler deploy --config wrangler.jsonc; root directory /.

# Cloudflare migration status

This is an in-progress replacement for the PHP/MySQL API. Do not deploy it as a complete application yet: actions that have not been ported return HTTP 501 rather than silently returning demo data.

## Current foundation

- One Worker serves the Vite static assets and same-origin `/api/*` requests.
- D1 schema and first migration live under `migrations/`.
- Database-backed HTTP-only sessions, CSRF tokens, PBKDF2 password hashes, resident registration, sign-in/out, profile reads/updates, emergency reports, report status changes, photo upload/delivery, and basic staff dashboard reads are implemented.
- `report-media` currently stores private photos in D1 and limits them to 1 MB on the free pilot.
- The original PHP backend remains in `xampp/` for reference and local development. Its MySQL database contents are not automatically copied to D1.

## Still to migrate

User management, report assignments and alternate-route creation, location writes, evacuation-center writes, IoT device registration and readings, notification dispatch/read state, caller logs, audit-log queries, configuration updates, analytics, and the operations portal's remaining actions are not all implemented yet. Do not direct real residents or emergency work to this deployment.

## Local and account setup

1. Use a Cloudflare account on its free Workers plan. Free usage has limits; it is not an uptime or emergency-response guarantee.
2. Create the D1 database and put its assigned ID in `wrangler.jsonc`; do not commit credentials or tokens.
3. Apply the migration with Wrangler, then build the frontend and deploy the Worker with Cloudflare's Git deployment settings.
4. Configure the `BOOTSTRAP_ADMIN_TOKEN` as a temporary Worker secret. Use the `bootstrap-admin` API action once to create the first administrator, then immediately remove that secret. The token must never be embedded in the frontend or committed.
5. Test the health route, registration, login, CSRF-protected requests, data persistence after redeploy, and account recovery before considering any pilot.

This migration starts with a new D1 database; it does not migrate MySQL user accounts, password hashes, incidents, sensor data, or other existing records.

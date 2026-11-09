# LDRRMO Diplahan Emergency Response System

The application is a React frontend and PHP API backed by MySQL. It provides resident registration and emergency reporting, staff operations and assignments, evacuation centers, IoT devices/readings, notifications, caller logs, audit records, system configuration, analytics, and role-gated administration. The same application and database power all workflows; no demo accounts or sample incidents are created.

## Deploy to Render

The included `Dockerfile` builds the frontend and runs the PHP API in one Render web service. You do not need XAMPP or a separate frontend/API service. A persistent MySQL-compatible database is still required: Render does not provide managed MySQL, so provision one with a MySQL provider that allows connections from Render. The Blueprint uses a paid Render Starter service because private report photos need persistent storage; the database provider may also charge for its service.

1. Provision a MySQL 8-compatible database and import `xampp/database.sql` into the selected database. The SQL file creates the application tables in whichever database you select.
2. In Render, create a Blueprint from this repository using `render.yaml`, or create a Docker web service with the repository's `Dockerfile`. The included service uses a persistent disk for private report photos.
3. Set the service's `LDRRMO_DB_HOST`, `LDRRMO_DB_PORT`, `LDRRMO_DB_NAME`, `LDRRMO_DB_USER`, and `LDRRMO_DB_PASSWORD` environment variables to the database provider's connection values. If the provider assigned a database name, use that same name for `LDRRMO_DB_NAME` and when importing the SQL file. Allow connections from Render as required by the provider. If the provider supplies a CA certificate, add it as a Render secret file and set `LDRRMO_DB_SSL_CA` to that file's path; the API verifies the database server certificate when this setting is present.
4. Deploy the service and provision the first administrator using Render's Shell:

   ```sh
   read -s LDRRMO_NEW_USER_PASSWORD
   export LDRRMO_NEW_USER_PASSWORD
   php /var/www/ldrrmo/cli/create-user.php admin@example.gov.ph "System Administrator" admin
   unset LDRRMO_NEW_USER_PASSWORD
   ```

   Enter a unique password of 12 to 72 bytes at the prompt. The CLI script permits the first administrator only while no administrator exists. After signing in, use User Management to create additional accounts.

Render's assigned `onrender.com` URL is the public website URL. API calls use the same origin; the production build does not use a localhost URL. Keep the database credentials private and configure regular database backups with the database provider.

## Local development

For local development with XAMPP, follow [the local XAMPP setup guide](xampp/SETUP.md). The frontend can be pointed at another API by setting `VITE_API_URL`; without it, the app uses `/api/index.php` on the same origin.

## Backend and security

The PHP API uses server-side PHP sessions, CSRF validation for mutations, prepared statements, server-side role checks, login throttling, password hashing, audit logging, and private authenticated media delivery. IoT readings are accepted only with a registered device's secret token; no simulated readings are produced. Browser polling replaces database realtime subscriptions.

Notification dispatch is persisted. In-app notifications are delivered from the database. Push, SMS, and email remain marked failed with a clear provider-not-configured message until real delivery providers are configured; the interface does not claim to have sent them.

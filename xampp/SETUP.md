# XAMPP installation and setup

The application requires a locally installed and running XAMPP stack. Install XAMPP for Windows with PHP 8.1+ and PDO MySQL, Fileinfo, and mbstring enabled. In XAMPP Control Panel, start **Apache** and **MySQL**. Confirm `http://localhost/` and `http://localhost/phpmyadmin/` work before continuing.

## 1. Create the MySQL database

For a fresh installation, import `xampp/database.sql` in phpMyAdmin. It creates the complete schema only—no accounts, incidents, evacuation centers, sensor readings, or demo data.

To upgrade an installation created by the previous standalone `/xampp` portal, back up `ldrrmo_xampp` first. In phpMyAdmin, run `migrate-existing-xampp-stage1.sql`, import `database.sql`, then run `migrate-existing-xampp-stage2.sql`. This migrates staff password hashes and IDs, reports, assignments' prior status history, registered sensors and readings, and audit history into the unified tables. Legacy tables are retained with `legacy_` names for verification; the application no longer uses them. No old account is silently discarded.

For an existing unified installation, run `migrate-safe-routes.sql` once in phpMyAdmin to enable saved alternate routes.

## 2. Install the API

Copy the contents of `xampp/api` into:

```text
C:\xampp\htdocs\ldrrmo-api\
```

The API URL is `http://localhost/ldrrmo-api/index.php`. The normal XAMPP MySQL defaults (127.0.0.1:3306, root, blank password) are used only for local setup. For any shared deployment, create a restricted MySQL account and configure `LDRRMO_DB_HOST`, `LDRRMO_DB_PORT`, `LDRRMO_DB_NAME`, `LDRRMO_DB_USER`, and `LDRRMO_DB_PASSWORD` in Apache's environment.

The default CORS allowlist is limited to `localhost:5173`, `127.0.0.1:5173`, and their Vite preview port 4173 variants. For another frontend origin, set `LDRRMO_ALLOWED_ORIGINS` to an exact comma-separated origin list. Do not use `*` with session cookies.

Private image uploads are stored outside the web root at `C:\xampp\ldrrmo-private-uploads` by default. Configure `LDRRMO_PRIVATE_UPLOAD_DIR` to an existing protected path if needed. Do not move this storage directory inside `htdocs`; files are served only after PHP verifies the signed-in user's access to the report.

For report photos, verify `upload_max_filesize` and `post_max_size` in XAMPP's `php.ini` allow at least 6 MB, then restart Apache. The API accepts only JPEG, PNG, WebP, or GIF files up to 5 MB.

## 3. Configure and start the frontend

In `.env`, set:

```dotenv
VITE_XAMPP_API_URL=http://localhost/ldrrmo-api/index.php
```

Then run `npm install` and `npm run dev`, and open `http://localhost:5173`. If Apache or MySQL is stopped or unreachable, the app surfaces an API connection error.

## 4. Provision the first administrator

The first administrator must be provisioned from the local PHP CLI. No default password/account exists. Use a private password prompt and remove the transient environment variable immediately:

```powershell
$securePassword = Read-Host "Enter an administrator password (12 to 72 bytes)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $env:LDRRMO_NEW_USER_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    & "C:\xampp\php\php.exe" ".\xampp\cli\create-user.php" "admin@diplahan.gov.ph" "System Administrator" "admin"
} finally {
    Remove-Item Env:LDRRMO_NEW_USER_PASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
```

CLI provisioning permits the initial admin only while there is no administrator. It takes a MySQL advisory lock to prevent concurrent first-admin creation. Once the first admin exists, add further users, staff, or administrators through the server-authorized User Management page. The same CLI script can provision `ldrrmo_staff` and `supervisor` accounts.

Resident self-registration creates only the `resident` role. The API ignores any client-supplied role for public registration.

## Operations

- Reports, status history, assignments, evacuation centers, notifications, caller logs, audit logs, configuration, and analytics are persisted in the shared MySQL database.
- Staff routes and admin operations are authorized by the PHP API on every request, not only by client-side route guards.
- The app polls the API periodically for updates.
- Supervisors and administrators can draw a proposed landslide detour by clicking waypoints on the operations map. Published routes appear on the resident incident map and create an in-app notice for residents. These manually drawn lines are not verified road directions; confirm access and safety with field responders before travel.
- Sensor values must come from an actual registered sensor or trusted gateway. The admin IoT page shows the device code and token once; submit readings to `POST http://localhost/ldrrmo-api/index.php?action=device-reading` with `X-Device-Token` and JSON such as `{"device_code":"IOT-<assigned-code>","reading":1.42}`. Keep device tokens out of browser code and source control.
- In-app notifications are delivered from the database. Push/SMS/email delivery remains unavailable until a real provider is configured, and those channel attempts are saved with an explicit failed status.

XAMPP is for local development, not a hardened public production server. Do not expose its default installation directly to the internet. Any public deployment needs HTTPS, firewalling, restricted database credentials, secure Apache configuration, and a reviewed operational security plan.

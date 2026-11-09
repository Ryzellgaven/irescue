#!/bin/sh
set -eu

port="${PORT:-10000}"
case "$port" in
  ''|*[!0-9]*) echo "PORT must be a numeric TCP port." >&2; exit 1 ;;
esac

sed -i "s/Listen 80/Listen ${port}/" /etc/apache2/ports.conf
sed -i "s/:80>/:${port}>/" /etc/apache2/sites-available/000-default.conf

upload_dir="${LDRRMO_PRIVATE_UPLOAD_DIR:-/var/data/ldrrmo-uploads}"
mkdir -p "$upload_dir"
chown www-data:www-data "$upload_dir"
chmod 700 "$upload_dir"

exec apache2-foreground

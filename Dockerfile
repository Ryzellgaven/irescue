FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_URL=/api/index.php
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM php:8.3-apache-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install mbstring pdo_mysql \
    && a2enmod rewrite \
    && rm -rf /var/lib/apt/lists/*

COPY --from=frontend-build /app/dist/ /var/www/html/
COPY xampp/api/ /var/www/html/api/
COPY xampp/cli/ /var/www/ldrrmo/cli/
COPY xampp/database.sql /var/www/ldrrmo/database.sql
COPY .htaccess /var/www/html/.htaccess
COPY docker-entrypoint.sh /usr/local/bin/ldrrmo-entrypoint

RUN printf '%s\n' \
    '<Directory /var/www/html>' \
    '    AllowOverride All' \
    '    Require all granted' \
    '</Directory>' \
    > /etc/apache2/conf-available/ldrrmo.conf \
    && a2enconf ldrrmo \
    && printf '%s\n' 'upload_max_filesize=6M' 'post_max_size=7M' > /usr/local/etc/php/conf.d/uploads.ini \
    && chmod +x /usr/local/bin/ldrrmo-entrypoint \
    && chown -R www-data:www-data /var/www/html

ENV LDRRMO_PRIVATE_UPLOAD_DIR=/var/data/ldrrmo-uploads
EXPOSE 10000
ENTRYPOINT ["ldrrmo-entrypoint"]

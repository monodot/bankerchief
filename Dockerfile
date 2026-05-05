FROM docker.io/library/caddy:alpine
COPY frontend/ /srv
COPY Caddyfile /etc/caddy/Caddyfile

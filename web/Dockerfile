# Static showcase site served by unprivileged nginx on :8080.
# Build from the repo root after `git lfs pull`, so media/ holds real files:
#   docker buildx build --platform linux/amd64 -t registry.driseam.com/chatsprig/site:<tag> --push web
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html film.html site.css site.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY demos /usr/share/nginx/html/demos
COPY media /usr/share/nginx/html/media

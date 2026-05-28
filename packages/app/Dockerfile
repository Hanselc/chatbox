FROM oven/bun:1.3.14-debian AS builder

WORKDIR /app

# Install Python and build tools for native modules
RUN apt-get update && apt-get install -y python3 python3-pip make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock bunfig.toml tsconfig.json turbo.json ./
COPY patches patches
COPY packages packages

RUN bun install

WORKDIR /app/packages/app

ENV VITE_REMOTE_ONLY=true

RUN bun run build

FROM nginx:alpine

WORKDIR /usr/share/nginx/html

COPY --from=builder /app/packages/app/dist .

RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    \
    location /health { \
        access_log off; \
        return 200 "healthy\n"; \
    } \
    \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

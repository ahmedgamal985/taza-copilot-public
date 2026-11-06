# Taza Copilot server for Cloudflare Containers (also runs on any Docker host)
FROM node:24-slim

# pdftotext, for research PDFs uploaded from the admin page
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY . .

# Runs as the unprivileged "node" user; it only needs to write its data folder
RUN mkdir -p data/uploads && chown -R node:node /app/data
USER node

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "start.mjs"]

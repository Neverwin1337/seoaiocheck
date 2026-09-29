FROM node:22-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && python3 -m venv .venv && .venv/bin/pip install --no-cache-dir geo-optimizer-skill==4.18.3

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 libpython3.11 libxml2 libxslt1.1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.venv ./.venv
COPY package.json server.mjs network-guard.mjs ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 HOME=/tmp
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

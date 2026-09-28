# ---------- build stage ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# install deps (uses the lockfile; caches unless manifests change)
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

# build the client (server runs from TypeScript via tsx)
COPY . .
RUN npm run build --workspace @study-os/client

# ---------- runtime stage ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# copy the whole built workspace (native modules already compiled for this base)
COPY --from=build /app /app
EXPOSE 8080
CMD ["npm", "start"]

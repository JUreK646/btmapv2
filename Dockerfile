FROM node:24-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY shared ./shared
COPY src ./src
COPY server ./server
COPY tests ./tests
COPY public ./public
COPY index.html vite.config.ts tsconfig*.json ./
RUN pnpm build

# Runtime dependencies only: the API image does not need Vite, TypeScript or the type packages.
FROM node:24-slim AS production-dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM nginx:stable-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:24-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 BTMAP_DB=/app/data/btmap.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
# Reports the container unhealthy when the API stops answering, so the orchestrator can restart it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--experimental-strip-types", "server/start.ts"]

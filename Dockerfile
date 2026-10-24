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
COPY index.html vite.config.ts tsconfig*.json ./
RUN pnpm build

FROM nginx:stable-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:24-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 BTMAP_DB=/app/data/btmap.sqlite
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["node", "--experimental-strip-types", "server/start.ts"]
FROM node:20-alpine AS base
WORKDIR /app
COPY package.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY packages ./packages
RUN npm install --workspace=apps-gateway 2>/dev/null || npm install --prefix apps/gateway

FROM base AS build
COPY apps/gateway ./apps/gateway
COPY tsconfig.json ./tsconfig.json
RUN npm run build -w apps-gateway

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/gateway/dist ./dist
COPY --from=build /app/apps/gateway/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 8080
CMD ["node", "dist/index.js"]

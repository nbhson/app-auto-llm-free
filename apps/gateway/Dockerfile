FROM node:22-alpine AS base
WORKDIR /app
# Cache deps first (better layer)
COPY package.json ./
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY packages ./packages
RUN npm install --workspace=apps-gateway 2>/dev/null || npm install --prefix apps/gateway

FROM base AS build
COPY apps/gateway ./apps/gateway
COPY tsconfig.json ./tsconfig.json
# Copy data for build-time verification (models per-provider, freellms)
COPY data ./data
COPY models ./models
RUN npm run build -w apps-gateway

FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# Minimal runtime: only dist + production deps
COPY --from=build /app/apps/gateway/dist ./dist
COPY --from=build /app/apps/gateway/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
# Include freellms data for startup (models + verified)
COPY --from=build /app/data ./data
COPY --from=build /app/models ./models
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 7373
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://localhost:7373/health/ready || exit 1
CMD ["node", "dist/index.js"]

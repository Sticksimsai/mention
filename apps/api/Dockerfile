FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @mention/api... || pnpm install --filter @mention/api...
COPY packages ./packages
COPY apps/api ./apps/api
EXPOSE 3001
CMD ["pnpm", "--filter", "@mention/api", "start"]

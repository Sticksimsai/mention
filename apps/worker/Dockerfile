FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @mention/worker... || pnpm install --filter @mention/worker...
COPY packages ./packages
COPY apps/worker ./apps/worker
CMD ["pnpm", "--filter", "@mention/worker", "start"]

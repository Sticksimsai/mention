FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @mention/web... || pnpm install --filter @mention/web...
COPY packages ./packages
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
RUN pnpm --filter @mention/web build

FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "--filter", "@mention/web", "start"]

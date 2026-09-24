FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm install --frozen-lockfile --filter @draftpilot/api...
RUN pnpm --filter @draftpilot/shared build && pnpm --filter @draftpilot/api build
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","packages/api/dist/main.js"]

# Self-host image: Next.js + journaled migrate + seed. Secrets come from
# the environment at run time — never baked in. See SELF-HOST.md.
FROM node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN chmod +x scripts/self-host-entrypoint.sh
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["./scripts/self-host-entrypoint.sh"]

# 使用官方 Node.js 镜像
FROM node:18-alpine AS base

# 安装依赖阶段
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 复制包管理文件和 Prisma schema
COPY package.json pnpm-lock.yaml* ./

COPY prisma ./prisma
RUN corepack enable pnpm && pnpm config set registry https://mirrors.cloud.tencent.com/npm/ && pnpm i --frozen-lockfile

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

# 生成 Prisma 客户端
RUN corepack enable pnpm && pnpm prisma generate && pnpm prisma migrate
RUN corepack enable pnpm && pnpm prisma db seed
# 构建应用
ENV NEXT_TELEMETRY_DISABLED 1
ENV SKIP_ENV_VALIDATION 1
RUN pnpm build

# 运行阶段
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# 复制整个 node_modules（包含 Prisma 客户端）
COPY --from=builder /app/node_modules ./node_modules

# 创建上传目录
RUN mkdir -p /app/output && chown -R nextjs:nodejs /app/output

USER nextjs

EXPOSE 3000

ENV PORT 3000
# ENV HOSTNAME "0.0.0.0"
ENV AUTH_SECRET "xf1iPS9/AZm07mEvJYrwvuvkWHp/Ar+UikY22W5qbaE="
ENV BLOB_READ_WRITE_TOKEN "vercel_blob_rw_TZGHkytU9NWCoZ1y_tBbhK9AW6a25Vjm1lif7j0JygI4QgC"
ENV DATABASE_URL postgres://daa87bacb60a7e42d92b707344abf93baca84644de1a9e353b698fcffd36c1cb:sk_JLrIVRvdGX58yJ5VwiYLY@db.prisma.io:5432/postgres?sslmode=require
# 启动脚本
# COPY --from=builder /app/docker-entrypoint.sh ./
# USER root
# RUN chmod +x docker-entrypoint.sh
# USER nextjs
# CMD ["/bin/sh", "docker-entrypoint.sh"]



CMD ["node_modules/.bin/next", "start"]
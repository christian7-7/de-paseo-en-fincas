# ── Stage 1: Pruner ──────────────────────────────────────────────────────────
# Usa turbo prune para generar un subconjunto mínimo del monorepo
FROM node:20-alpine AS pruner
RUN apk add --no-cache libc6-compat
RUN npm install -g turbo@^2
WORKDIR /app
COPY . .
RUN turbo prune web --docker

# ── Stage 2: Installer ────────────────────────────────────────────────────────
# Instala dependencias del subconjunto podado
FROM node:20-alpine AS installer
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm
WORKDIR /app

# Instalar dependencias (usa el lockfile podado)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ── Stage 3: Builder ──────────────────────────────────────────────────────────
# Copia el código fuente completo y construye
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
RUN npm install -g pnpm turbo@^2
WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .

# Variables requeridas en build time (valores por defecto seguros)
ARG NEXTAUTH_SECRET=build-time-secret
ARG NEXTAUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_BRAND_COLOR_PRIMARY=E8832A
ARG NEXT_PUBLIC_BRAND_COLOR_DARK=1A1D2E

ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_BRAND_COLOR_PRIMARY=$NEXT_PUBLIC_BRAND_COLOR_PRIMARY
ENV NEXT_PUBLIC_BRAND_COLOR_DARK=$NEXT_PUBLIC_BRAND_COLOR_DARK
# Prisma necesita la URL para generar el cliente (se sobreescribe en runtime)
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/depaseoenfincas

RUN pnpm turbo build --filter=web

# ── Stage 4: Runner ───────────────────────────────────────────────────────────
# Imagen final mínima con el output standalone de Next.js
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Archivos estáticos públicos
COPY --from=builder /app/apps/web/public ./apps/web/public

# Output standalone (incluye server.js y node_modules mínimos)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]

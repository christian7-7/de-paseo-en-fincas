#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# De Paseo en Fincas — Script de Bootstrap
# Verifica el entorno y guía el proceso de setup inicial
# ══════════════════════════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BLUE}${BOLD}🌿 De Paseo en Fincas — Bootstrap${RESET}"
echo -e "${BLUE}══════════════════════════════════${RESET}"
echo ""

# ─── Verificar herramientas ───────────────────────────────────────────────────
echo -e "${BOLD}1. Verificando herramientas requeridas...${RESET}"
MISSING_TOOLS=()

check_tool() {
  if command -v "$1" &>/dev/null; then
    echo -e "   ${GREEN}✓${RESET} $1 $(command -v "$1" | head -1)"
  else
    echo -e "   ${RED}✗${RESET} $1 — NO encontrado"
    MISSING_TOOLS+=("$1")
  fi
}

check_tool "node"
check_tool "pnpm"
check_tool "git"
check_tool "docker"

# Check node version
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -n "$NODE_VERSION" ] && [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "   ${RED}✗${RESET} Node.js >= 18 requerido (encontrado: v${NODE_VERSION})"
  MISSING_TOOLS+=("node>=18")
fi

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Error: Herramientas faltantes: ${MISSING_TOOLS[*]}${RESET}"
  echo ""
  echo "Instalar:"
  echo "  • Node.js: https://nodejs.org (usa nvm: nvm install 20)"
  echo "  • pnpm: npm install -g pnpm"
  echo "  • Docker: https://docker.com"
  exit 1
fi

echo ""
echo -e "${GREEN}✓ Todas las herramientas están disponibles${RESET}"
echo ""

# ─── Verificar archivo .env ───────────────────────────────────────────────────
echo -e "${BOLD}2. Verificando variables de entorno...${RESET}"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo -e "   ${YELLOW}→ Archivo .env creado desde .env.example${RESET}"
    echo -e "   ${YELLOW}→ Por favor completa las variables antes de continuar${RESET}"
  else
    echo -e "   ${RED}✗ No se encontró .env ni .env.example${RESET}"
    exit 1
  fi
fi

# Check required vars
REQUIRED_VARS=(
  "DATABASE_URL"
  "NEXTAUTH_SECRET"
  "GROQ_API_KEY"
)

OPTIONAL_VARS=(
  "GOOGLE_CLIENT_ID"
  "GOOGLE_CLIENT_SECRET"
  "GOOGLE_CALENDAR_ENCRYPTION_KEY"
  "DEEPSEEK_API_KEY"
  "OPENAI_API_KEY"
  "WHATSAPP_PHONE_NUMBER_ID"
  "WHATSAPP_ACCESS_TOKEN"
  "WHATSAPP_VERIFY_TOKEN"
  "INSTAGRAM_PAGE_ACCESS_TOKEN"
  "WOMPI_PUBLIC_KEY"
  "WOMPI_PRIVATE_KEY"
  "WOMPI_INTEGRITY_SECRET"
  "WOMPI_EVENTS_SECRET"
  "CLOUDINARY_CLOUD_NAME"
  "NEXT_PUBLIC_MAPBOX_TOKEN"
  "RESEND_API_KEY"
  "REDIS_URL"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  value=$(grep "^${var}=" .env 2>/dev/null | cut -d= -f2- | tr -d '"')
  if [ -z "$value" ] || [ "$value" = "" ]; then
    MISSING_VARS+=("$var")
    echo -e "   ${RED}✗${RESET} ${var} — FALTANTE (requerida)"
  else
    echo -e "   ${GREEN}✓${RESET} ${var}"
  fi
done

echo ""
echo "  Variables opcionales:"
for var in "${OPTIONAL_VARS[@]}"; do
  value=$(grep "^${var}=" .env 2>/dev/null | cut -d= -f2- | tr -d '"')
  if [ -z "$value" ] || [ "$value" = "" ]; then
    echo -e "   ${YELLOW}⚠${RESET} ${var} — no configurada (funcionalidad limitada)"
  else
    echo -e "   ${GREEN}✓${RESET} ${var}"
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo ""
  echo -e "${RED}Variables requeridas faltantes: ${MISSING_VARS[*]}${RESET}"
  echo "Edita .env y completa los valores antes de continuar."
  echo ""
fi

# ─── Instrucciones de setup ───────────────────────────────────────────────────
echo ""
echo -e "${BOLD}3. Pasos para completar el setup:${RESET}"
echo ""
echo -e "   ${BLUE}a)${RESET} Instalar dependencias:"
echo -e "      ${BOLD}pnpm install${RESET}"
echo ""
echo -e "   ${BLUE}b)${RESET} Levantar Redis (si usas local):"
echo -e "      ${BOLD}docker run -d -p 6379:6379 redis:alpine${RESET}"
echo ""
echo -e "   ${BLUE}c)${RESET} Generar cliente Prisma:"
echo -e "      ${BOLD}pnpm --filter @repo/db generate${RESET}"
echo ""
echo -e "   ${BLUE}d)${RESET} Ejecutar migraciones:"
echo -e "      ${BOLD}pnpm --filter @repo/db migrate:dev${RESET}"
echo ""
echo -e "   ${BLUE}e)${RESET} Poblar la base de datos (seed):"
echo -e "      ${BOLD}pnpm --filter @repo/db seed${RESET}"
echo ""
echo -e "   ${BLUE}f)${RESET} Iniciar todos los servicios:"
echo -e "      ${BOLD}pnpm dev${RESET}"
echo ""
echo -e "   ${BLUE}g)${RESET} Abrir el navegador:"
echo -e "      Web:          ${BOLD}http://localhost:3000${RESET}"
echo -e "      Dashboard:    ${BOLD}http://localhost:3002${RESET}"
echo -e "      Owner Portal: ${BOLD}http://localhost:3003${RESET}"
echo -e "      Gateway:      ${BOLD}http://localhost:3001${RESET}"
echo ""
echo -e "${BOLD}Credenciales de prueba (después del seed):${RESET}"
echo -e "   Admin:    admin@depaseoenfincas.co / Paseo2025!"
echo -e "   Asesor:   carlos.asesor@depaseoenfincas.co / Paseo2025!"
echo -e "   Propiet.: propietario1@finca.co / Paseo2025!"
echo -e "   Cliente:  cliente1@gmail.com / Paseo2025!"
echo ""
echo -e "${GREEN}${BOLD}✅ Bootstrap completado${RESET}"
echo ""

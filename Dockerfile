# syntax=docker/dockerfile:1.7
#
# Образ только для разработки: в продакшен ничего не поставляется (пакеты публикуются в npm).
# Цели (--target):
#   dev   — Vite dev-сервер с hot reload (порт 5173), цель по умолчанию
#   test  — unit-тесты (vitest)
#   e2e   — Playwright + Chromium (только он, Firefox и WebKit в образ не ставятся), тесты идут по E2E_BASE_URL
#
ARG NODE_VERSION=22
ARG PNPM_VERSION=9

# ---------------------------------------------------------------- base
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# ---------------------------------------------------------------- deps
# Копируем только манифесты: слой с зависимостями пересобирается лишь при их изменении.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/sandbox/package.json apps/sandbox/
COPY packages/document/package.json packages/document/
COPY packages/store/package.json packages/store/
COPY packages/engine/package.json packages/engine/
COPY packages/react/package.json packages/react/
COPY packages/styles/package.json packages/styles/
# --ignore-scripts: husky (`prepare`) внутри образа не нужен и падает без .git
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---------------------------------------------------------------- test (unit)
FROM deps AS test
COPY . .
ENV CI=true
CMD ["pnpm", "test:unit"]

# ---------------------------------------------------------------- e2e
FROM deps AS e2e
COPY . .
ENV CI=true \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# Версия браузера берётся из установленного @playwright/test (из lock-файла).
RUN pnpm exec playwright install --with-deps chromium
CMD ["pnpm", "test:e2e", "--project=chromium"]

# ---------------------------------------------------------------- dev
# Последняя стадия: именно она собирается, если --target не указан.
FROM deps AS dev
COPY . .
ENV HOST=0.0.0.0 \
    CI=true
EXPOSE 5173
CMD ["pnpm", "--filter", "sandbox", "dev"]

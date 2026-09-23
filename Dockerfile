FROM node:22-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN python3 -m venv /opt/weather-venv \
  && /opt/weather-venv/bin/pip install --only-binary=:all: --no-cache-dir -r pipeline/requirements.txt \
  && rm -rf /opt/weather-venv/lib/python*/site-packages/pip* /opt/weather-venv/bin/pip* \
  && npm install -g corepack@latest \
  && corepack pnpm install --frozen-lockfile \
  && corepack pnpm run build

FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3-minimal ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /opt/weather-venv /opt/weather-venv
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/pipeline ./pipeline
COPY --from=builder /app/server/data ./server/data
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production \
    PYTHON_BIN=/opt/weather-venv/bin/python

CMD ["node", "dist/index.cjs"]

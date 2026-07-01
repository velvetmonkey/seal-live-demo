# SPDX-License-Identifier: Apache-2.0
FROM node:22-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY seal-config.js decide.cjs server.mjs ./
COPY wasm ./wasm
ENV PORT=8800 EVIDENCE_DIR=/evidence SEAL_POLICY=/policy/policy.json
EXPOSE 8800
CMD ["node", "server.mjs"]

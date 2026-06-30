# SPDX-License-Identifier: Apache-2.0
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY seal-config.js decide.cjs server.mjs ./
COPY wasm ./wasm
ENV PORT=8800 EVIDENCE_DIR=/evidence SEAL_POLICY=/policy/policy.json
EXPOSE 8800
CMD ["node", "server.mjs"]

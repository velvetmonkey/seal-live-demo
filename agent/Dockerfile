# SPDX-License-Identifier: Apache-2.0
FROM node:22-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4
WORKDIR /app
COPY package.json agent.mjs preflight.mjs ./
ENV PHASE=p1 MCP_URL=http://seal-gateway:8800/mcp SCENARIO_DIR=/scenarios EVIDENCE_DIR=/evidence
CMD ["node", "agent.mjs"]

# SPDX-License-Identifier: Apache-2.0
FROM node:22-slim
WORKDIR /app
COPY package.json agent.mjs preflight.mjs ./
ENV PHASE=p1 MCP_URL=http://seal-gateway:8800/mcp SCENARIO_DIR=/scenarios EVIDENCE_DIR=/evidence
CMD ["node", "agent.mjs"]

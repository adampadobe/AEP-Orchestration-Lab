FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ARG AEP_LAB_BUILD_SHA
ARG AEP_LAB_BUILD_PR
ENV AEP_LAB_BUILD_SHA=$AEP_LAB_BUILD_SHA
ENV AEP_LAB_BUILD_PR=$AEP_LAB_BUILD_PR
ENV PORT=8080
ENV HOST=0.0.0.0
EXPOSE 8080

CMD ["node", "src/server.mjs"]

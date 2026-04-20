# Official Playwright image with Chromium + all required Linux libs pre-installed.
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]

# syntax=docker/dockerfile:1
FROM node:24.11.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit
COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && NODE_OPTIONS=--max-old-space-size=3072 npm run build

FROM node:24.11.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN chown -R node:node /app/node_modules/@prisma /app/node_modules/prisma /app/node_modules/.prisma
USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]

# syntax=docker/dockerfile:1

# The SDK is installed from npm against the committed lockfile, exactly as a
# user would install it.

FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json app.cjs ./
COPY src ./src

USER node

EXPOSE 3000

CMD ["node", "app.cjs"]

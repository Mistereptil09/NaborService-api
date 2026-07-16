FROM node:20-alpine AS base
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./

FROM base AS dev
ENV NODE_ENV=development
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM base AS build
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS prod
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
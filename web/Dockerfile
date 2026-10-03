# Static PWA build served by nginx. In Coolify: Build Pack "Dockerfile", Base Directory "/web", port 80.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the bundle at build time. Override with a Coolify build variable.
ARG VITE_POCKETBASE_URL=https://foodshare.bogsynth.com
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM node:24-alpine AS build-env
WORKDIR /app
RUN corepack enable
COPY . /app/
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-env /app/build/client /usr/share/nginx/html
EXPOSE 80

# Panel WWW: budowanie aplikacji React i serwowanie jej przez nginx,
# który jednocześnie pośredniczy w ruchu do Sztudio Core (/api, /ws).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
# Panel z obrazu Docker domyślnie łączy się z Core pod tym samym adresem.
ENV VITE_DEFAULT_MODE=live
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

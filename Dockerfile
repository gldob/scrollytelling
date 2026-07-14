FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js trips.geojson /usr/share/nginx/html/
EXPOSE 80

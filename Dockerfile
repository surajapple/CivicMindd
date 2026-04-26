FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Cloud Run sets the PORT environment variable
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]

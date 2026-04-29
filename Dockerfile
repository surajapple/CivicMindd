# Multi-stage build — keeps the final image minimal
# Stage 1: Install production dependencies only
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: Runtime image
FROM node:18-alpine AS runner
WORKDIR /app

# Run as non-root user for security
RUN addgroup -S civicmind && adduser -S civicmind -G civicmind

# Copy only what's needed
COPY --from=builder /app/node_modules ./node_modules
COPY server/ ./server/
COPY src/     ./src/
COPY public/  ./public/
COPY package.json ./

# Cloud Run sets the PORT environment variable automatically
ENV PORT=8080
ENV NODE_ENV=production

# Use the non-root user
USER civicmind

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["node", "server/server.js"]

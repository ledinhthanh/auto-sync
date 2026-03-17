# Dockerfile for Next.js app with PostgreSQL tools
FROM node:18-alpine

# Install postgresql-client (provides pg_dump and pg_restore), mariadb-client (for mysql source) and ssl libs for Prisma
RUN apk add --no-cache postgresql15-client mariadb-client openssl libc6-compat

WORKDIR /app

# Install dependencies separately for layer caching
COPY package*.json ./
RUN npm install

# Copy prisma schema first for caching generation
COPY prisma ./prisma/
RUN npx prisma generate

# Copy application source
COPY . .

# Environment variables (can be overridden by docker-compose)
ENV NODE_ENV=development
ENV PORT=3000

EXPOSE 3000

# Next.js dev server
CMD ["npm", "run", "dev"]

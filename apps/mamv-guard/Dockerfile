FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/mamv-guard/package.json apps/mamv-guard/package.json
COPY packages/sdk-js/package.json packages/sdk-js/package.json
RUN npm install --workspace @mamv/guard
FROM node:20-alpine AS runner
WORKDIR /app/apps/mamv-guard
ENV NODE_ENV=production
COPY --from=deps /app/node_modules /app/node_modules
COPY apps/mamv-guard .
COPY packages/sdk-js /app/packages/sdk-js
RUN npx prisma generate && npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]

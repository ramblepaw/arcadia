# node:sqlite (built into Node 22.5+) needs no native compilation, and argon2
# ships prebuilt bindings for common platforms - a glibc-based image (rather
# than Alpine/musl) maximizes the chance a prebuild is found instead of
# falling back to a from-source compile that would need extra build tools.
FROM node:24-slim

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8090
ENV DB_PATH=/data/games.db

EXPOSE 8090
VOLUME ["/data"]

# Runs as your TrueNAS user (3000:3000) so files it writes to the mounted
# /data volume stay manageable from Windows over SMB, matching your other apps.
USER 3000:3000

CMD ["node", "server/src/index.js"]

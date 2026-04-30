# EE Control Panel — production image.
#
# The container needs to invoke `ee` (EasyEngine) on the host. Two strategies:
#   1) Bind-mount /usr/local/bin/ee + /var/run/docker.sock + /opt/easyengine
#      (recommended — see docker-compose.yml).
#   2) Run with --net=host and call EE through ssh.
#
# We base on the official Node image plus the docker CLI so EE can talk to
# the host docker daemon through the mounted socket.

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

# Install minimal tooling: docker CLI (so `ee` can talk to host docker via the
# mounted socket), build tools for better-sqlite3, and CA bundles.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg python3 make g++ \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
         https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli \
 && apt-get purge -y curl gnupg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD ["node", "src/app.js"]

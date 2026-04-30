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

# Install only: SSH client (so the panel can run `ee` on the host over SSH),
# build tools for better-sqlite3, and CA bundles.
# EasyEngine itself stays on the host — the container never runs the ee
# binary or any PHP runtime locally.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates openssh-client python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data /app/logs

EXPOSE 3000

CMD ["node", "src/app.js"]

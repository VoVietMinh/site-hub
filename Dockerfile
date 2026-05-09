# EE Control Panel - production image.
#
# The container needs to invoke `ee` (EasyEngine) on the host. Two strategies:
#   1) Bind-mount /usr/local/bin/ee + /var/run/docker.sock + /opt/easyengine
#      (recommended - see docker-compose.yml).
#   2) Run with --net=host and call EE through ssh.
#
# We base on the official Node image plus the docker CLI so EE can talk to
# the host docker daemon through the mounted socket.

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000

# Install only: SSH client (so the panel can run `ee` on the host over SSH),
# build tools for better-sqlite3, and CA bundles.
# EasyEngine itself stays on the host - the container never runs the ee
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

# Tell Docker to use SIGTERM so Node's graceful-shutdown handler fires.
STOPSIGNAL SIGTERM

# Health check - Docker marks the container healthy once /healthz responds 200.
# This allows nginx-proxy to keep routing to the old container until the new
# one is confirmed ready, minimising visible downtime to < 2 seconds.
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "var h=require('http');h.get('http://localhost:3000/healthz',function(r){process.exit(r.statusCode===200?0:1);}).on('error',function(){process.exit(1);});"

CMD ["node", "src/app.js"]

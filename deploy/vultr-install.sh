#!/usr/bin/env bash

set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <repository-url> <domain>"
  echo "Example: $0 git@github.com:Xamnyii/hmtyinfo.git rmrd.tech"
  exit 1
fi

REPOSITORY_URL="$1"
DOMAIN="$2"
APP_NAME="hmtyinfo"
APP_USER="hmty"
APP_DIR="/var/www/${APP_NAME}"
MONGO_DB="hmtyauth"
MONGO_APP_USER="${APP_NAME}_app"
MONGO_APP_PASSWORD="$(openssl rand -hex 32)"

if [[ -e "$APP_DIR" ]]; then
  echo "${APP_DIR} already exists. Provisioning is intended for a new server."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates certbot curl git gnupg nginx software-properties-common

curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --dearmor -o /etc/apt/keyrings/mongodb-server-8.0.gpg
source /etc/os-release
echo "deb [signed-by=/etc/apt/keyrings/mongodb-server-8.0.gpg] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/8.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt-get update
apt-get install -y mongodb-org nodejs
npm install --global pm2

id -u "$APP_USER" &>/dev/null || useradd --create-home --shell /bin/bash "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
runuser -u "$APP_USER" -- git clone "$REPOSITORY_URL" "$APP_DIR"

cd "$APP_DIR"
runuser -u "$APP_USER" -- npm ci

cat > .env.production <<EOF
MONGODB_URI=mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@127.0.0.1:27017/${MONGO_DB}?authSource=${MONGO_DB}
MONGODB_DB=${MONGO_DB}
# MCP_SERVER_URL=http://127.0.0.1:PORT/mcp
# CFDI_ANALYZER_URL=http://127.0.0.1:8001
EOF
chown "$APP_USER:$APP_USER" .env.production
chmod 600 .env.production

mongosh --quiet --eval "db.getSiblingDB('${MONGO_DB}').createUser({user: '${MONGO_APP_USER}', pwd: '${MONGO_APP_PASSWORD}', roles: [{role: 'readWrite', db: '${MONGO_DB}'}]})"
if ! grep -q '^security:' /etc/mongod.conf; then
  cat >> /etc/mongod.conf <<'EOF'

security:
  authorization: enabled
EOF
fi
systemctl enable --now mongod
systemctl restart mongod

cp deploy/ecosystem.config.cjs "$APP_DIR/ecosystem.config.cjs"
chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs"
runuser -u "$APP_USER" -- sh -c "cd '$APP_DIR' && npm run build && pm2 start ecosystem.config.cjs"
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"
runuser -u "$APP_USER" -- pm2 save

sed "s/__DOMAIN__/${DOMAIN}/g" deploy/nginx-hmtyinfo.conf.template > "/etc/nginx/sites-available/${APP_NAME}"
ln -s "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect --email "admin@${DOMAIN}" -d "$DOMAIN"

echo "Deployment complete: https://${DOMAIN}"
echo "Application directory: ${APP_DIR}"
echo "MongoDB stays bound to localhost with authentication enabled."
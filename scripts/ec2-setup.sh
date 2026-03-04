#!/usr/bin/env bash
# Idempotent EC2 setup for game-prototype.
# Safe to run on every deploy — skips steps that are already done.
set -euo pipefail

DOMAIN="game.zachvanoast.com"
APP_DIR="$HOME/game-prototype"
NODE_MAJOR=20

echo "=== EC2 setup for $DOMAIN ==="

# ── Node.js ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  echo "Installing Node.js $NODE_MAJOR..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node.js $(node -v) already installed"
fi

# ── PM2 ────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  sudo npm install -g pm2
  # Configure PM2 to start on boot
  sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" || true
else
  echo "PM2 already installed"
fi

# ── nginx ──────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
  echo "Installing nginx..."
  sudo apt-get update -y
  sudo apt-get install -y nginx
  sudo systemctl enable nginx
fi

# Write nginx config (always overwrite to pick up changes)
echo "Configuring nginx for $DOMAIN..."
sudo tee /etc/nginx/sites-available/game-prototype >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site (idempotent — ln -sf overwrites)
sudo ln -sf /etc/nginx/sites-available/game-prototype /etc/nginx/sites-enabled/game-prototype
sudo nginx -t && sudo systemctl reload nginx

# ── Certbot SSL ────────────────────────────────────────────────────────────
if ! command -v certbot &>/dev/null; then
  echo "Installing certbot..."
  sudo apt-get install -y certbot python3-certbot-nginx
fi

# Only provision cert if one doesn't exist yet for this domain
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "Provisioning SSL certificate for $DOMAIN..."
  sudo certbot --nginx -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --redirect
else
  echo "SSL certificate already exists for $DOMAIN"
  # Ensure nginx config has certbot's SSL additions
  sudo certbot --nginx -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email \
    --keep-existing || true
fi

echo "=== EC2 setup complete ==="

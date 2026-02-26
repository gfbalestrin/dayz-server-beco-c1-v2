#!/bin/bash

# ==================================================
# Configuração de HTTPS - DayZ Admin Interface
# ==================================================

# VARIÁVEIS
DOMAIN="beco.servegame.com"
FLASK_PORT="12345"
EMAIL="seu-email@exemplo.com"

echo "📦 Instalando Nginx e Certbot..."
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

echo "⚙️  Configurando Proxy Reverso para $DOMAIN..."
NGINX_CONF="/etc/nginx/sites-available/dayz_admin"

sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$FLASK_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

echo "🔗 Ativando site no Nginx..."
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo "🛡️  Solicitando certificado Let's Encrypt..."
# O comando abaixo já configura a renovação automática no systemd/cron
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

# ADICIONANDO A ROTINA DE RENOVAÇÃO NO CRON (Garantia extra)
# O Certbot geralmente usa um timer do systemd, mas vamos reforçar 
# para que o Nginx reinicie sempre que renovar.
echo "⏰ Configurando hook de renovação para reiniciar o Nginx..."
sudo bash -c "cat > /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh" <<EOF
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh

echo ""
echo "=================================================="
echo "✅ Sucesso! O certificado será renovado automaticamente."
echo "Para testar a renovação agora, execute:"
echo "sudo certbot renew --dry-run"
echo "=================================================="
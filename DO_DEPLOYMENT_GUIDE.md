# DigitalOcean Deployment & Cleaning Guide (MAK FIN PAY)

આ ગાઈડમાં જૂની વેબસાઈટ ડીલીટ કરી ડિજિટલ ઓશિયન (DigitalOcean Droplet) પર **MAK FIN PAY** નો ફ્રેશ (Fresh) સેટઅપ કરવાના તમામ સ્ટેપ્સ આપેલા છે.

---

## 🧹 Step 1: જૂની વેબસાઈટ અને સર્વિસ ડીલીટ કરો (Clean Old Setup)

સૌપ્રથમ તમારા ડિજિટલ ઓશિયન ડ્રોપ્લેટમાં SSH દ્વારા લોગિન કરો:
```bash
ssh root@YOUR_DROPLET_IP
```

### 1.1 જૂના Docker Containers ડીલીટ કરો (જો Docker ચાલતું હોય):
```bash
# બધા જૂના ચાલી રહેલા કન્ટેનર્સ બંધ અને ડીલીટ કરો
docker stop $(docker ps -aq) 2>/dev/null
docker rm $(docker ps -aq) 2>/dev/null

# જૂની સિસ્ટમમાંથી નકામી ઈમેજીસ અને ડેટા સાફ કરો
docker system prune -a --volumes -f
```

### 1.2 જૂના PM2 અને Node Process ક્લિયર કરો (જો PM2 ચાલતું હોય):
```bash
pm2 stop all 2>/dev/null
pm2 delete all 2>/dev/null
pm2 save --force 2>/dev/null
```

### 1.3 જૂની Apache / Nginx સેટિંગ્સ હટાવો:
```bash
systemctl stop apache2 2>/dev/null
systemctl disable apache2 2>/dev/null

systemctl stop nginx 2>/dev/null
rm -f /etc/nginx/sites-enabled/*
```

---

## 🚀 Step 2: Fresh Docker & Docker Compose ઇન્સ્ટોલ કરો

```bash
# સિસ્ટમ પેકેજ અપડેટ કરો
apt update && apt upgrade -y

# Docker ડાયરેક્ટ ઇન્સ્ટોલ કરો
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Docker plugin ચકાસો
docker compose version
```

---

## 📦 Step 3: કોડ ક્લોન કરો અને `.env` સેટ કરો

### 3.1 પ્રોજેક્ટ ડાઉનલોડ / ક્લોન કરો:
```bash
# નવું ફોલ્ડર બનાવો
mkdir -p /var/www/makfinpay
cd /var/www/makfinpay

# GitHub પરથી કોડ ક્લોન કરો (જો Git સેટ કરેલું હોય):
git clone https://github.com/YOUR_GITHUB_USERNAME/makfinpay.git .
```

### 3.2 Production `.env` ફાઈલ તૈયાર કરો:
```bash
cp .env.production.example .env
nano .env
```
> **નોંધ**: `.env` ફાઈલમાં તમારા Supabase credentials, JWT secret, Admin Email/Password અને Payment Gateway keys ચેક કરી સાચવો (`Ctrl + O`, `Enter`, `Ctrl + X`).

---

## ⚡ Step 4: 1-કમાન્ડથી નવો સેટઅપ ચાલુ કરો (Fresh Deployment)

```bash
# Docker Compose દ્વારા Backend અને Frontend બંને કન્ટેનર બિલ્ડ કરી ચાલુ કરો
docker compose up -d --build
```

### 4.1 Status ચકાસો:
```bash
# કન્ટેનર્સ ચાલે છે કે નહીં જુઓ:
docker compose ps

# લાઈવ લોગ્સ જોવા માટે:
docker compose logs -f
```

તમારો **MAK FIN PAY** પ્રોજેક્ટ હવે Droplet ના IP સરનામા પર સફળતાપૂર્વક ચાલુ થઈ જશે! (`http://YOUR_DROPLET_IP`)

---

## 🔒 Step 5: ડોમેન અને ફ્રી SSL (HTTPS Certbot) સેટ કરો (Optional & Recommended)

જો તમારી પાસે ડોમેન નામ હોય (દા.ત. `makfinpay.com`):

1. **DigitalOcean DNS / Domain A-Record સેટ કરો**:
   - Host: `@` (અથવા `www`)
   - Value: `YOUR_DROPLET_IP`

2. **Nginx Host અને Certbot ઇન્સ્ટોલ કરો**:
```bash
apt install -y nginx certbot python3-certbot-nginx

# Certbot સેટઅપ
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## 🛠️ અગત્યના કમાન્ડ્સ (Quick Commands Reference)

- **સર્વર રિસ્ટાર્ટ કરવું**: `docker compose restart`
- **અપડેટ કર્યા પછી નવું બિલ્ડ કરવું**: `git pull && docker compose up -d --build`
- **લોગ્સ જોવા**: `docker compose logs -f backend` અથવા `docker compose logs -f frontend`

# TradeOff Oracle Server Deployment

This guide is for a portfolio/resume-grade production-style deployment on an Oracle
Cloud VM. It keeps the app realistic without pretending it is real custody.

## Server Baseline

- Ubuntu 22.04 or 24.04 VM
- 2 OCPU / 8 GB RAM minimum for the full stack
- Open ports: `22`, `80`, `443`
- Keep database, Redis, Kafka, and observability ports closed to the public internet

## Install Runtime

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

In the Oracle Cloud console, also allow ingress for `80` and `443` in the subnet
security list or network security group.

## Deploy

```bash
git clone <your-repo-url> tradeoff
cd tradeoff
cp .env.production.example .env.production
```

Edit `.env.production`:

- Set a strong `JWT_SECRET`
- Set a strong `POSTGRES_PASSWORD`
- Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` to your domain
- Set `CORS_ORIGINS` to your domain

Build and start:

```bash
docker compose --env-file .env.production up -d --build postgres redis backend frontend nginx
docker compose exec backend python scripts/seed_data.py
```

For the full observability/event stack:

```bash
docker compose --env-file .env.production up -d kafka zookeeper prometheus grafana loki node-exporter worker
```

## Health Checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/ready
curl http://127.0.0.1:3000
```

Expected:

- `/health` returns `healthy`
- `/ready` returns database `true`
- frontend returns HTML

## TLS

For a resume deployment, the cleanest path is:

```bash
sudo apt install -y certbot
```

Use either:

- Cloudflare Tunnel in front of `localhost:8080`
- A host-level Nginx reverse proxy with Certbot
- Oracle load balancer with certificate management

Point public traffic to the Compose Nginx gateway on port `8080` or map it directly
to `80`/`443` after configuring TLS.

## Operations

Useful commands:

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose exec backend python scripts/seed_data.py
docker compose pull
docker compose up -d --build
```

Backup Postgres:

```bash
docker compose exec postgres pg_dump -U tradeoff tradeoff > tradeoff-backup.sql
```

Restore:

```bash
docker compose exec -T postgres psql -U tradeoff tradeoff < tradeoff-backup.sql
```

## Portfolio Positioning

Recommended resume wording:

> Built TradeOff, a production-style centralized exchange simulator featuring
> matching-engine logic, wallet ledger/reservation flows, auth/MFA/API keys,
> copy-trading replication, realtime WebSockets, admin operations, observability,
> Dockerized deployment, and automated frontend/backend smoke tests.

Be explicit that it is a simulator and not a real-money exchange.

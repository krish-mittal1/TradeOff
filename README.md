# TradeOff Exchange Simulator

TradeOff is a portfolio-ready, production-style crypto paper-trading exchange. It
models signup-funded demo wallets, spot trading, price-time priority matching,
wallet reservation and settlement, portfolio analytics, risk controls, copy trading,
notifications, realtime market streams, and operational infrastructure.

The frontend is JavaScript/JSX with Next.js 15 and React 19. The backend is FastAPI,
SQLAlchemy 2, PostgreSQL/TimescaleDB, Redis, Kafka, Celery, and WebSockets. Live
crypto prices use Binance public market WebSockets with an automatic simulated
fallback if Binance is unavailable.

## Quick Start

```bash
docker compose up --build
docker compose exec backend python scripts/seed_data.py
```

Open:

- Exchange UI: `http://localhost:3000`
- API docs: `http://localhost:8000/api/docs`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Nginx gateway: `http://localhost:8080`

Demo login: `trader1@cex.com` / `Password123!`

## Verification

Backend:

```bash
cd backend
.venv\Scripts\python.exe -m pytest
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Browser smoke tests:

```bash
cd frontend
npm run e2e
```

`npm run e2e` defaults to `http://127.0.0.1:3002`. Override with:

```bash
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
npm run e2e
```

Docker images:

```bash
docker build -t cex-backend-check ./backend
docker build -t cex-frontend-check ./frontend
docker compose config --quiet
```

The local Compose stack uses `postgres:16-alpine` for reliable development startup.
The initial migration enables TimescaleDB only when that extension is available.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for service boundaries, financial
consistency, event flows, schemas, security, observability, deployment, load testing,
roadmap, bottlenecks, and risks.

## Oracle Deployment

See [docs/ORACLE_DEPLOYMENT.md](docs/ORACLE_DEPLOYMENT.md) for a production-style
Oracle Cloud VM deployment runbook, including firewall, environment variables,
health checks, TLS options, and portfolio/resume positioning.

## Important Scope

This is a simulator, not a custodian. It does not connect to blockchain nodes, hold
real funds, or provide investment advice. Production custody requires HSM-backed key
management, chain-specific deposit monitoring, compliance workflows, and independent
security review.

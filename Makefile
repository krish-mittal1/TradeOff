.PHONY: help dev-backend dev-frontend dev-docker dev-down dev-reset test test-unit test-load lint format migrate seed clean blockchain-compile blockchain-test blockchain-node blockchain-deploy

help:
	@echo "TradeOff - Development Commands"
	@echo "===================================="
	@echo "make dev-docker     - Start all services via Docker Compose"
	@echo "make dev-down       - Stop all Docker services"
	@echo "make dev-reset      - Reset all data (kill + delete volumes)"
	@echo "make dev-backend    - Start backend locally (requires Docker for deps)"
	@echo "make dev-frontend   - Start frontend locally"
	@echo "make migrate        - Run Alembic migrations"
	@echo "make seed           - Seed database with test data"
	@echo "make test           - Run all tests"
	@echo "make test-unit      - Run unit tests only"
	@echo "make test-load      - Run load tests"
	@echo "make lint           - Run linters"
	@echo "make format         - Format code"
	@echo ""
	@echo "Blockchain:"
	@echo "make blockchain-compile - Compile Solidity contracts"
	@echo "make blockchain-test    - Run Hardhat tests"
	@echo "make blockchain-node    - Start local Hardhat node"
	@echo "make blockchain-deploy  - Deploy contracts to local node"

dev-docker:
	docker compose up -d

dev-down:
	docker compose down

dev-reset:
	docker compose down -v
	docker compose up -d

dev-backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev

migrate:
	cd backend && alembic upgrade head

migrate-downgrade:
	cd backend && alembic downgrade -1

seed:
	cd backend && python scripts/seed_data.py

test:
	cd backend && pytest tests/ -v --cov=app --cov-report=term-missing

test-unit:
	cd backend && pytest tests/unit/ -v

test-load:
	cd backend && locust -f tests/load/locustfile.py --host=http://localhost:8000

lint:
	cd backend && ruff check .
	cd backend && ruff format --check .

format:
	cd backend && ruff format .

blockchain-compile:
	cd blockchain && npx hardhat compile

blockchain-test:
	cd blockchain && npx hardhat test

blockchain-node:
	cd blockchain && npx hardhat node

blockchain-deploy:
	cd blockchain && npx hardhat run scripts/deploy.js --network localhost

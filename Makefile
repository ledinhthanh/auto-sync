# DataSync Platform Makefile

.PHONY: help dev stop reset logs status prisma-migrate prisma-generate seed seed-source lint typecheck build check test test-docker test-executor-docker test-unit test-integration test-e2e test-watch test-connection test-dependency test-plan test-executor test-scheduler test-model test-sync-flow test-up test-down test-db-reset test-prepare

check: lint typecheck build ## Run lint, typecheck, and build

# ENVS
TEST_ENV = NODE_ENV=test DOTENV_CONFIG_PATH=tests/.env.test

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# --- Development ---

dev: ## Start dev environment in Docker (fast)
	docker compose up -d
	@echo "---"
	@echo "DataSync is running at http://localhost:3030"
	@echo "Use 'make logs' to follow application output"
	@echo "Use 'make rebuild' if you changed the Dockerfile or prisma schema"
	@echo "---"

rebuild: ## Build and start dev environment
	docker compose up -d --build

stop: ## Stop dev environment
	docker compose stop

down: ## Tear down dev environment
	docker compose down

reset: ## Reset dev environment (volumes inclusive)
	docker compose down -v
	docker compose up -d --build

logs: ## View dev logs
	docker compose logs -f app

status: ## Check container status
	docker compose ps

# --- Database (RUN INSIDE DOCKER) ---

prisma-migrate: ## Run prisma migrations in container
	docker compose exec app npx prisma migrate dev

prisma-generate: ## Generate prisma client in container
	docker compose exec app npx prisma generate

prisma-push: ## Push schema to DB in container
	docker compose exec app npx prisma db push

seed: ## Seed application DB with sample data in container
	docker compose exec app npx tsx scripts/seed-test.ts

seed-source: ## Seed source DB with sample data in container
	docker compose exec -e SOURCE_DB_HOST=db_source -e SOURCE_DB_PORT=5432 -e SOURCE_DB_USER=source_user -e SOURCE_DB_PASS=source_password -e SOURCE_DB_NAME=source_db app npx tsx scripts/seed-source-large.ts
	docker compose exec -e MYSQL_HOST=mysql_source -e MYSQL_PORT=3306 -e MYSQL_USER=source_user -e MYSQL_PASSWORD=source_password -e MYSQL_DATABASE=mysql_source_db app npx tsx scripts/seed-mysql-source-large.ts

# --- Code Quality ---

lint: ## Run ESLint in container
	docker compose exec app npm run lint

typecheck: ## Run TypeScript type check in container
	docker compose exec app npx tsc --noEmit

build: ## Build the application in container
	docker compose exec app npm run build

# --- Testing (RUN INSIDE DOCKER) ---

test: ## Run all tests inside container
	docker compose exec app npx vitest run

test-unit: ## Run unit tests inside container
	docker compose exec app npx vitest run tests/unit

test-integration: ## Run integration tests inside container
	docker compose exec app npx vitest run tests/integration

test-e2e: ## Run end-to-end tests inside container
	docker compose exec app npx vitest run tests/e2e

test-watch: ## Run vitest watch inside container
	docker compose exec app npx vitest

# --- Service Specific Tests ---

test-connection: ## Test connection service in container
	docker compose exec app npx vitest run tests/integration/services/connection.test.ts

test-executor: ## Test sync-executor service in container
	docker compose exec app npx vitest run tests/integration/services/sync-executor.test.ts

test-scheduler: ## Test scheduler service in container
	docker compose exec app npx vitest run tests/integration/services/scheduler.test.ts

# --- Utility ---

sh: ## Open a shell in the app container
	docker compose exec app sh

test-db-reset: ## Reset test database inside container
	docker compose exec app npx prisma db push --force-reset --accept-data-loss
	docker compose exec app npx tsx tests/fixtures/seed-source.ts

# --- Docker Managed Tests ---

test-prepare: ## Ensure test containers are running
	docker compose -f docker-compose.test.yml up -d
	docker compose exec app sh -c "set -a; \
		[ -f tests/.env.docker ] && . ./tests/.env.docker; \
		export MYSQL_HOST=mysql_source_test; \
		export MYSQL_PORT=3306; \
		export MYSQL_DATABASE=mysql_source_test; \
		export MYSQL_USER=source_user; \
		export MYSQL_PASSWORD=source_password; \
		set +a; npx prisma db push --accept-data-loss"

test-docker: test-prepare ## Run tests inside container using Docker environment
	docker compose exec app sh -c "set -a; [ -f tests/.env.docker ] && . ./tests/.env.docker; set +a; npx vitest run $(ARGS)"

test-executor-docker: test-prepare ## Run sync-executor tests inside container
	docker compose exec app sh -c "set -a; [ -f tests/.env.docker ] && . ./tests/.env.docker; set +a; npx vitest run tests/integration/services/sync-executor.test.ts"

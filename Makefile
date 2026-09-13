COMPOSE := docker compose -f infra/docker-compose.yml
DC_FRONTEND := --cwd frontend

.PHONY: help up down build backend-bash init logs ps frontend-install frontend-dev frontend-build freeze clean-db clean-image

help:
	@echo "GeoDash GIS Platform (Django + PostGIS + React + MapLibre)"
	@echo ""
	@echo "Usage:"
	@echo "  make up              Start all services (postgis, api, redis, celery, nginx)"
	@echo "  make down            Stop all services"
	@echo "  make build           Build images"
	@echo "  make init            Initialize system (creates System Administrator)"
	@echo "  make migrate         Apply migrations"
	@echo "  make logs            Tail logs"
	@echo "  make clean-db        Stop services and delete database + PostGIS data"
	@echo "  make clean-image     Remove docker images (and volumes)"
	@echo "  make frontend-install  Install frontend deps"
	@echo "  make frontend-dev     Run Vite dev server (hot reload)"
	@echo "  make frontend-build   Production build (into frontend/dist)"

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

migrate:
	$(COMPOSE) exec api python manage.py migrate

init:
	$(COMPOSE) exec -it api python manage.py init_system

backend-bash:
	$(COMPOSE) exec api bash

logs:
	$(COMPOSE) logs -f

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

clean-db:
	$(COMPOSE) down -v

clean-image:
	$(COMPOSE) down --rmi all -v --remove-orphans
	docker image prune -f

freeze:
	cd backend && pip freeze > requirements.lock.txt
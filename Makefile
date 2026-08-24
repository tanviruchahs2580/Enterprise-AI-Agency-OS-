all: help

help:
	@echo "Targets: dev | test | lint | typecheck | build | migrate | seed | self-test | verify-production"

dev:
	node scripts/dev.mjs

test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

build:
	npm run build

migrate:
	node scripts/migrate.mjs

seed:
	node scripts/seed.mjs

self-test:
	npm run self-test

verify-production:
	node scripts/verify-production.mjs

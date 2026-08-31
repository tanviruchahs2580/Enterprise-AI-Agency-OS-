all: help

help:
	@echo "Targets: dev | test | lint | typecheck | build | migrate | seed | self-test | docs-check | verify-production"

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

docs-check:
	npm run docs-check

verify-production:
	node scripts/verify-production.mjs

# Generated documentation: architecture diagram, OpenAPI and the Postman collection.
#
#   make docs-sync    regenerate everything (what CI checks)
#   make docs-check   fail if any generated artifact is stale
#
# Needs apps/api/.venv (see README) and Node 22+. The architecture PNG also
# needs draw.io desktop or Docker; without either it is left for CI to render.

PYTHON ?= $(if $(wildcard apps/api/.venv/bin/python),apps/api/.venv/bin/python,python3)
NODE_TOOLS := tools/node_modules/.package-lock.json

.PHONY: docs-sync docs-check architecture-sync architecture-check api-sync api-check docs-test \
	postman-stack postman-stack-down postman-test postman-test-mock postman-push

docs-sync: architecture-sync api-sync

docs-check: architecture-check api-check

architecture-sync:
	$(PYTHON) -m tools.architecture sync

architecture-check:
	$(PYTHON) -m tools.architecture check

api-sync: $(NODE_TOOLS)
	$(PYTHON) tools/api_docs/export_openapi.py
	node tools/api_docs/postman.mjs

api-check: $(NODE_TOOLS)
	$(PYTHON) tools/api_docs/export_openapi.py --check
	node tools/api_docs/postman.mjs --check

docs-test: $(NODE_TOOLS)
	$(PYTHON) -m pytest -q -p no:cacheprovider tools/tests

# ── Using the API from Postman (see README) ──────────────────────────────────

postman-stack:                  ## API on :8000 + local sign-in (code 123456), needs Docker
	PYTHON=$(PYTHON) tools/api_docs/stack.sh up

postman-stack-down:
	tools/api_docs/stack.sh down

postman-test: $(NODE_TOOLS)     ## run the whole collection (ENV=local|dev|prod, default local)
	tools/node_modules/.bin/postman collection run "postman/collections/Remote AI Platform" \
		--environment postman/environments/$(or $(ENV),local).environment.yaml \
		--globals postman/globals/workspace.globals.yaml \
		--no-report-events --disable-unicode

postman-test-mock: $(NODE_TOOLS) ## run the whole collection against the generated mock (no Docker)
	tools/node_modules/.bin/postman collection run "postman/collections/Remote AI Platform" \
		--environment postman/environments/local.environment.yaml \
		--globals postman/globals/workspace.globals.yaml \
		--use-mock "{{base_url}} mock:./postman/mocks/remote-ai-platform" \
		--env-var mock_run=true --env-var auto_sign_in=false \
		--no-report-events --disable-unicode

postman-push: $(NODE_TOOLS)     ## mirror the repo into your Postman workspace
	tools/api_docs/publish.sh

# Pinned official Postman tooling; install scripts stay off (see tools/.npmrc).
$(NODE_TOOLS): tools/package.json tools/package-lock.json
	npm ci --prefix tools --ignore-scripts --no-audit --no-fund

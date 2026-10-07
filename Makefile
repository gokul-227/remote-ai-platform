# Generated documentation: architecture diagram and OpenAPI. The Postman
# collection is not kept in the repository; `make postman-sync` (and CI on prod)
# builds it from the code and updates the Postman cloud collection.
#
#   make docs-sync    regenerate everything (what CI checks)
#   make docs-check   fail if any generated artifact is stale
#
# Needs apps/api/.venv (see README) and Node 22+. The architecture PNG also
# needs draw.io desktop or Docker; without either it is left for CI to render.

PYTHON ?= $(if $(wildcard apps/api/.venv/bin/python),apps/api/.venv/bin/python,python3)
NODE_TOOLS := tools/node_modules/.package-lock.json

.PHONY: docs-sync docs-check architecture-sync architecture-check api-sync api-check docs-test \
	postman-sync

docs-sync: architecture-sync api-sync

docs-check: architecture-check api-check

architecture-sync:
	$(PYTHON) -m tools.architecture sync

architecture-check:
	$(PYTHON) -m tools.architecture check

api-sync:
	$(PYTHON) tools/api_docs/export_openapi.py

api-check:
	$(PYTHON) tools/api_docs/export_openapi.py --check

docs-test: $(NODE_TOOLS)
	$(PYTHON) -m pytest -q -p no:cacheprovider tools/tests

# ── Postman cloud collection (see README) ────────────────────────────────────

# OpenAPI straight from the code -> one Postman collection. Without
# POSTMAN_API_KEY (or with DRY_RUN=1) it only converts and validates.
postman-sync: $(NODE_TOOLS)
	$(PYTHON) tools/api_docs/export_openapi.py .cache/openapi.yaml
	node tools/api_docs/postman_sync.mjs .cache/openapi.yaml $(if $(DRY_RUN),--dry-run)

# Pinned official Postman converter; install scripts stay off (see tools/.npmrc).
$(NODE_TOOLS): tools/package.json tools/package-lock.json
	npm ci --prefix tools --ignore-scripts --no-audit --no-fund

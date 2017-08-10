ifeq (,$(wildcard core.inc.mk/Makefile))
INSTALL_CORE_INC_MK := $(shell git submodule update --init --recursive core.inc.mk)
ifneq (,$(filter undefine,$(.FEATURES)))
undefine INSTALL_CORE_INC_MK
endif
endif

export TOP := $(abspath $(shell dirname $(lastword $(MAKEFILE_LIST)))/../..)
include core.inc.mk/Makefile

PATH := $(GIT_ROOT)/node_modules/.bin:$(PATH)
PATH := $(MAKE_PATH)/node_modules/.bin:$(PATH)
export PATH

JS_FILES := $(shell $(FIND_Q) src test -type f -name "*.js" -print)
JS_FILES_GEN := $(patsubst src/%.js,lib/%.js,$(JS_FILES))

EC_FILES := $(shell $(GIT) ls-files | $(GREP) -v -e "^package-lock.json$$" -e "^LICENSE$$" | $(SED) "s/^/'/g" | $(SED) "s/$$/'/g")

ECLINT_ARGS := --max_line_length 1024
ESLINT_ARGS := --config $(MAKE_PATH)/node_modules/eslint-config-firecloud/no-ide.js

ECLINT = $(shell PATH="$(PATH)" $(WHICH_Q) eclint || echo "ECLINT_NOT_FOUND")
NPM_PUBLISH_GIT = $(shell PATH="$(PATH)" $(WHICH_Q) npm-publish-git || echo "NPM_PUBLISH_GIT_NOT_FOUND")

NODE_DEBUG_BRK ?=

# ------------------------------------------------------------------------------

.PHONY: all
all: deps build check ## Fetch dependencies, build and check.


.PHONY: clean
clean: ## Clean.
	@$(ECHO_DO) "Cleaning..."
	$(RM) \
		lib \
		node_modules
	@$(ECHO_DONE)


.PHONY: nuke
nuke: ## Nuke (Stash actually) all files/changes not checked in.
	@$(ECHO_DO) "Nuking..."
	$(GIT) reset
	$(GIT) stash --all
	@$(ECHO_DONE)


.PHONY: deps
deps: ## Fetch dependencies.
	$(GIT) submodule sync
	$(GIT) submodule update --init --recursive
	$(NPM) install --no-package-lock
	node_modules/babel-preset-firecloud/npm-install-peer-dependencies
	node_modules/eslint-config-firecloud/npm-install-peer-dependencies


$(JS_FILES_GEN): lib/%.js: src/%.js $(JS_FILES)
	$(MKDIR) $(shell dirname $@)
	$(BABEL) $< --source-maps --out-file $@


.PHONY: build-js
build-js: $(JS_FILES_GEN)


.PHONY: build
build: build-js ## Build.


.PHONY: lint-ec
lint-ec:
	$(ECLINT) check $(ECLINT_ARGS) $(EC_FILES) || { \
		$(ECLINT) fix $(ECLINT_ARGS) $(EC_FILES) 2>/dev/null >&2; \
		exit 1; \
	}


.PHONY: lint-js
lint-js:
	@$(ECHO_DO) "Linting JS..."
	$(ESLINT) $(ESLINT_ARGS) $(JS_FILES) || { \
		$(ESLINT) $(ESLINT_ARGS) --fix $(JS_FILES) 2>/dev/null >&2; \
		exit 1; \
	}
	@$(ECHO_DONE)


.PHONY: lint
lint: lint-ec lint-js


.PHONY: check
check: lint ## Check.


.PHONY: version
version: version/patch ## Bump version (patch level).


.PHONY: version/%
version/%: ## Bump version to given level (major/minor/patch).
	$(NPM) version ${*}


.PHONY: publish
publish: ## Publish as a git version tag.
	$(NPM_PUBLISH_GIT)


.PHONY: publish/%
publish/%: ## Publish as given git tag.
	$(NPM_PUBLISH_GIT) --tag ${*}


.PHONY: package-json-prepare
ifneq (node_modules,$(shell basename $(abspath ..))) # let Makefile build, or else build runs twice
package-json-prepare:
	:
else # installing as dependency
package-json-prepare: build
endif


server: ## Start the LambdaProxy server.
	AWS_ACCOUNT_ID=$(AWS_ACCOUNT_ID) $(NODE) $(NODE_DEBUG_BRK) ./index.js | ./node_modules/bunyan/bin/bunyan


server/debug: ## Start the LambdaProxy server in debug-brk mode.
	NODE_DEBUG_BRK="--inspect --debug-brk" $(MAKE) start

ifeq (,$(wildcard support-firecloud/Makefile))
INSTALL_SUPPORT_FIRECLOUD := $(shell git submodule update --init --recursive support-firecloud)
ifneq (,$(filter undefine,$(.FEATURES)))
undefine INSTALL_SUPPORT_FIRECLOUD
endif
endif

include support-firecloud/repo/mk/node.common.mk
include support-firecloud/repo/mk/js.check.eslint.mk
include support-firecloud/repo/mk/core.misc.release.npg.mk

# ------------------------------------------------------------------------------

NODE_DEBUG_BRK ?=

# ------------------------------------------------------------------------------

server: guard-env-AWS_ACCOUNT_ID ## Start the LambdaProxy server.
	$(NODE) $(NODE_DEBUG_BRK) ./index.js


server/debug: ## Start the LambdaProxy server in debug-brk mode.
	NODE_DEBUG_BRK="--inspect --debug-brk" $(MAKE) start

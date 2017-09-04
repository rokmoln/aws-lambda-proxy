ifeq (,$(wildcard support-firecloud/Makefile))
INSTALL_SUPPORT_FIRECLOUD := $(shell git submodule update --init --recursive support-firecloud)
ifneq (,$(filter undefine,$(.FEATURES)))
undefine INSTALL_SUPPORT_FIRECLOUD
endif
endif

include support-firecloud/repo/Makefile.pkg.node.mk

BUNYAN ?= $(call which,BUNYAN,bunyan)
NODE_DEBUG_BRK ?=

# ------------------------------------------------------------------------------

server: guard-env-AWS_ACCOUNT_ID ## Start the LambdaProxy server.
	$(NODE) $(NODE_DEBUG_BRK) ./index.js | $(BUNYAN)


server/debug: ## Start the LambdaProxy server in debug-brk mode.
	NODE_DEBUG_BRK="--inspect --debug-brk" $(MAKE) start

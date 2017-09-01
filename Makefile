ifeq (,$(wildcard support-firecloud/Makefile))
INSTALL_SUPPORT_FIRECLOUD := $(shell git submodule update --init --recursive support-firecloud)
ifneq (,$(filter undefine,$(.FEATURES)))
undefine INSTALL_SUPPORT_FIRECLOUD
endif
endif

include support-firecloud/repo/Makefile.pkg.node.mk

NODE_DEBUG_BRK ?=

# ------------------------------------------------------------------------------

server: ## Start the LambdaProxy server.
	AWS_ACCOUNT_ID=$(AWS_ACCOUNT_ID) $(NODE) $(NODE_DEBUG_BRK) ./index.js | ./node_modules/bunyan/bin/bunyan


server/debug: ## Start the LambdaProxy server in debug-brk mode.
	NODE_DEBUG_BRK="--inspect --debug-brk" $(MAKE) start

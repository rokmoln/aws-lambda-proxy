export TOP := $(abspath $(shell dirname $(lastword $(MAKEFILE_LIST)))/../..)
include $(TOP)/support/mk/Makefile.pkg.mk

# ------------------------------------------------------------------------------

APEX_TOP := $(TOP)/apex
APEX_FUNS := $(shell $(FIND_Q) $(APEX_TOP)/functions -mindepth 1 -maxdepth 1 -type d -printf "%f\n")

package.dir/VERSION:
	$(MAKE) -f "$(TOP)/support/mk/Makefile.pkg.mk" $@
	for f in $(APEX_FUNS); do \
		$(MKDIR) package.dir/apex/functions/$${f}; \
		cp $(APEX_TOP)/functions/$${f}/package.json package.dir/apex/functions/$${f}/package.json; \
	done

start: ## Start the LambdaProxy server
	ENV_NAME=$(ENV_NAME) node ./index.js

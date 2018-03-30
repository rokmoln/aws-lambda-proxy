import _ from 'lodash-firecloud';
import os from 'os';

export let isProd = /^prod/.test(process.env.NODE_ENV);

_.defaults(process.env, {
  PORT: '8081',
  DEBUG_HOST: '',
  DEBUG_PORT: '',
  LOG_LEVEL: 'INFO',
  NODE_ENV: '',
  NODE_PATH: ''
});

if (!isProd) {
  _.defaults(process.env, {
    DEBUG_HOST: 'localhost',
    DEBUG_PORT: '9999',
    NODE_HEAPDUMP_OPTIONS: 'nosignal'
  });

  Error.stackTraceLimit = Infinity;
}

// MAIN

export let hooks = {
  findLambdas: _.noop,
  preRouteSetup: _.noop,
  preHandle: _.noop
};

if (process.env.HOOKS_MODULE) {
  hooks = require(process.env.HOOKS_MODULE);
}

export let env = {
  address: '127.0.0.1',
  forkCount: isProd ? os.cpus().length : 0,
  heartbeat: {
    interval: 15, // minutes, 0 to disable
    memThresholdRss: undefined // MB
  },
  isProd,
  hooks,
  log: {
    level: process.env.LOG_LEVEL,
    toDir: undefined // isProd ? undefined : '.'
  },
  port: process.env.PORT
};

export default env;

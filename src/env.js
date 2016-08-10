// FIXME
let apexPath = '../../../apex';
let lambdas = [
  'api-screenshare-sessions'
];

/* eslint global-require:off */

import _ from 'lodash';
import os from 'os';
import path from 'path';

let isProd = _.includes(['prod', 'production'], process.env.NODE_ENV);
let projectPath = path.join(apexPath, `project.${process.env.ENV_NAME}.json`);
let project = isProd ? {name: process.env.ENV_NAME} : require(projectPath);

let NODE_PATH = process.env.NODE_PATH || '';

// EASY LOADING OF API LAMBDAS

(function() {
  [`${apexPath}/functions`].forEach(function(lambdasPath) {
    if (NODE_PATH.indexOf(lambdasPath) > -1) {
      return;
    }

    NODE_PATH = path.join(__dirname, lambdasPath) +
      (NODE_PATH ? `:${NODE_PATH}` : '');
  });
  process.env.NODE_PATH = NODE_PATH;
  require('module')._initPaths();
})();

// MAIN

if (!isProd) {
  _.defaults(process.env, {
    DEBUG_HOST: 'localhost',
    DEBUG_PORT: '9999',
    NODE_HEAPDUMP_OPTIONS: 'nosignal'
  });

  Error.stackTraceLimit = Infinity;
  // require('longjohn').async_trace_limit = -1;
}

_.defaults(process.env, {
  PORT: '8081',
  DEBUG_HOST: '',
  DEBUG_PORT: '',
  NODE_ENV: '',
  NODE_PATH: ''
});

lambdas = _.map(lambdas, function(name) {
  let pkg = require(path.join(name, 'package.json'));
  return {
    name,
    pkg
  };
});

module.exports = {
  address: '127.0.0.1',
  fork_count: isProd ? os.cpus().length : 0,
  heartbeat: {
    interval: 15, // minutes, 0 to disable
    mem_threshold_rss: undefined // MB
  },
  is_prod: isProd,
  lambdas,
  log: {
    level: process.env.LOG_LEVEL || 'INFO',
    to_dir: isProd ? undefined : '.'
  },
  port: process.env.PORT,
  project
};

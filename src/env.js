/* eslint global-require:off */

import _ from 'lodash';
import fs from 'fs';
import os from 'os';
import path from 'path';

if (!process.env.ENV_NAME) {
  throw new Error('process.env.ENV_NAME is undefined.');
}

let isProd = /^prod/.test(process.env.NODE_ENV);

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

let apexPath = [__dirname].concat(isProd ?
                                  ['..', 'apex'] :
                                  ['..', '..', '..', 'apex']
                                 );
apexPath = path.join(...apexPath);
let apexFunPath = path.join(apexPath, 'functions');
let project = {name: process.env.ENV_NAME};
let lambdas = _.filter(fs.readdirSync(apexFunPath), function(lambda) {
  let isDirectory = fs.statSync(`${apexFunPath}/${lambda}`).isDirectory();
  return isDirectory;
});

let NODE_PATH = _.defaultTo(process.env.NODE_PATH, '');

// EASY LOADING OF API LAMBDAS

(function() {
  [apexFunPath].forEach(function(extraPath) {
    if (NODE_PATH.indexOf(extraPath) > -1) {
      return;
    }

    NODE_PATH = extraPath + (NODE_PATH ? `:${NODE_PATH}` : '');
  });
  process.env.NODE_PATH = NODE_PATH;
  require('module')._initPaths();
})();

// MAIN

lambdas = _.map(lambdas, function(name) {
  let pkg = require(path.join(name, 'package.json'));
  return {
    name,
    pkg
  };
});

module.exports = {
  address: '127.0.0.1',
  forkCount: isProd ? os.cpus().length : 0,
  heartbeat: {
    interval: 15, // minutes, 0 to disable
    memThresholdRss: undefined // MB
  },
  isProd,
  lambdas,
  log: {
    level: process.env.LOG_LEVEL,
    toDir: undefined // isProd ? undefined : '.'
  },
  port: process.env.PORT,
  project
};

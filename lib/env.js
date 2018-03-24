'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.env = exports.hooks = exports.isProd = undefined;

var _lodashFirecloud = require('lodash-firecloud');

var _lodashFirecloud2 = _interopRequireDefault(_lodashFirecloud);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let isProd = exports.isProd = /^prod/.test(process.env.NODE_ENV);

_lodashFirecloud2.default.defaults(process.env, {
  PORT: '8081',
  DEBUG_HOST: '',
  DEBUG_PORT: '',
  LOG_LEVEL: 'INFO',
  NODE_ENV: '',
  NODE_PATH: ''
});

if (!exports.isProd) {
  _lodashFirecloud2.default.defaults(process.env, {
    DEBUG_HOST: 'localhost',
    DEBUG_PORT: '9999',
    NODE_HEAPDUMP_OPTIONS: 'nosignal'
  });

  Error.stackTraceLimit = Infinity;
}

// MAIN

let hooks = exports.hooks = {
  findLambdas: _lodashFirecloud2.default.noop,
  preRouteSetup: _lodashFirecloud2.default.noop,
  preHandle: _lodashFirecloud2.default.noop
};

if (process.env.HOOKS_MODULE) {
  exports.hooks = hooks = require(process.env.HOOKS_MODULE);
}

let env = exports.env = {
  address: '127.0.0.1',
  forkCount: exports.isProd ? _os2.default.cpus().length : 0,
  heartbeat: {
    interval: 15, // minutes, 0 to disable
    memThresholdRss: undefined // MB
  },
  isProd: exports.isProd,
  hooks: exports.hooks,
  log: {
    level: process.env.LOG_LEVEL,
    toDir: undefined // isProd ? undefined : '.'
  },
  port: process.env.PORT
};

module.exports = exports.env;

//# sourceMappingURL=env.js.map
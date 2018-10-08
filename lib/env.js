'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.env = exports.hooks = exports.isProd = undefined;

var _bluebird = require('bluebird/js/release/bluebird');

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
  findLambdas: (() => {
    var _ref = (0, _bluebird.coroutine)(function* () {
      throw new Error('"findLambdas" hook not defined');
    });

    return function findLambdas() {
      return _ref.apply(this, arguments);
    };
  })(),
  preRouteSetup: (() => {
    var _ref2 = (0, _bluebird.coroutine)(function* () {
      throw new Error('"preRouteSetup" hook not defined');
    });

    return function preRouteSetup() {
      return _ref2.apply(this, arguments);
    };
  })(),
  preHandle: (() => {
    var _ref3 = (0, _bluebird.coroutine)(function* () {
      throw new Error('"preHandle" hook not defined');
    });

    return function preHandle() {
      return _ref3.apply(this, arguments);
    };
  })()
};

if (process.env.HOOKS_MODULE) {
  exports.hooks = hooks = require(process.env.HOOKS_MODULE);
} else {
  console.error(`Env variable HOOKS_MODULE not set!`);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
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

exports.default = exports.env;

//# sourceMappingURL=env.js.map
"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.env = exports.hooks = exports.isProd = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _os = _interopRequireDefault(require("os"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

let isProd = /^prod/.test(process.env.NODE_ENV);exports.isProd = isProd;

_lodashFirecloud.default.defaults(process.env, {
  PORT: '8081',
  DEBUG_HOST: '',
  DEBUG_PORT: '',
  LOG_LEVEL: 'INFO',
  NODE_ENV: '',
  NODE_PATH: '' });


if (!exports.isProd) {
  _lodashFirecloud.default.defaults(process.env, {
    DEBUG_HOST: 'localhost',
    DEBUG_PORT: '9999',
    NODE_HEAPDUMP_OPTIONS: 'nosignal' });


  Error.stackTraceLimit = Infinity;
}

// MAIN

let hooks = {
  findLambdas: _lodashFirecloud.default.abstract('findLambdas'),
  preRouteSetup: _lodashFirecloud.default.abstract('preRouteSetup'),
  preHandle: _lodashFirecloud.default.abstract('preHandle') };exports.hooks = hooks;


if (process.env.HOOKS_MODULE) {
  exports.hooks = hooks = require(process.env.HOOKS_MODULE);
} else {
  console.error('Env variable HOOKS_MODULE not set!');
  // eslint-disable-next-line no-process-exit
  process.exit(1);
}

let env = {
  address: '127.0.0.1',
  forkCount: exports.isProd ? _os.default.cpus().length : 0,
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
  port: process.env.PORT };exports.env = env;var _default = exports.env;exports.default = _default;

//# sourceMappingURL=env.js.map
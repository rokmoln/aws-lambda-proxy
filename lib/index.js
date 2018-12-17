"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.run = exports.mainMaster = exports.onSimpleEvent = exports.mainWorker = exports.onHeartbeat = exports.onUncaughtException = exports.maybeWriteHeapSnapshot = exports.writeHeapSnapshot = exports.log = exports.logStreams = exports.httpServer = exports.workerId = exports.heapdump = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _bunyan = _interopRequireDefault(require("bunyan"));
var _cluster = _interopRequireDefault(require("cluster"));
var _env = _interopRequireDefault(require("./env"));
var _expressApp = _interopRequireDefault(require("./express-app"));
var _http = _interopRequireDefault(require("http"));
var _local = _interopRequireDefault(require("./handlers/local"));
var _proxy = _interopRequireDefault(require("./handlers/proxy"));
var _os = _interopRequireDefault(require("os"));
var _path = _interopRequireDefault(require("path"));
var _package = _interopRequireDefault(require("../package.json"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

let heapdump;exports.heapdump = heapdump;
if (_env.default.heartbeat.memThresholdRss && _env.default.log.toDir) {
  try {
    // eslint-disable-next-line dependencies/no-unresolved, import/no-extraneous-dependencies
    exports.heapdump = heapdump = require('heapdump');
  } catch (_err) {
  }
}
let workerId = _lodashFirecloud.default.get(_cluster.default, 'worker.id', 'M');exports.workerId = workerId;
let httpServer;

// LOG
exports.httpServer = httpServer;
let logStreams = [{
  name: 'stdout',
  stream: process.stdout,
  level: _lodashFirecloud.default.defaultTo(_env.default.log.level, 'TRACE') }];exports.logStreams = logStreams;


if (_env.default.log.toDir) {
  exports.logStreams.push({
    name: 'default',
    path: _path.default.join(_env.default.log.toDir, `${_package.default.name}.log`),
    period: '1d',
    count: 7,
    level: _env.default.log.level });

}

let log = _bunyan.default.createLogger({
  name: _package.default.name,
  src: true,
  serializers: undefined,
  streams: exports.logStreams });exports.log = log;


if (!_cluster.default.isMaster) {
  exports.log = log = exports.log.child({
    tagServerWorker: true,
    workerId: exports.workerId });

}

// EVENT HANDLERS

let writeHeapSnapshot = function (logObj) {
  if (!exports.heapdump) {
    return;
  }

  let filename = `${_package.default.name}.${exports.workerId}.uncaughtException.heapsnapshot`;
  logObj.heapsnapshot = {
    filename };

  exports.heapdump.writeSnapshot(`${_env.default.log.toDir}/${filename}`);
};exports.writeHeapSnapshot = writeHeapSnapshot;

let maybeWriteHeapSnapshot = function (logObj) {
  if (!exports.heapdump) {
    return;
  }

  let thresholdRss = _env.default.heartbeat.memThresholdRss;
  let currentRss;
  currentRss = logObj.process.memoryUsage.rss / (1024 * 1024);
  if (currentRss <= thresholdRss) {
    return false;
  }
  let filename = `${_package.default.name}.${exports.workerId}.${thresholdRss}MB.heapsnapshot`;
  logObj.heapsnapshot = {
    currentRss,
    thresholdRss,
    filename };

  exports.heapdump.writeSnapshot(`${_env.default.log.toDir}/${filename}`);
  thresholdRss = thresholdRss + 25;
  return true;
};exports.maybeWriteHeapSnapshot = maybeWriteHeapSnapshot;

let onUncaughtException = function (err) {
  let exceptionLog = {
    tag_uncaught_exception: true,
    err: {
      code: err.code,
      message: err.message,
      stack: err.stack } };



  console.error(err);
  console.error(err.stack);
  try {
    exports.writeHeapSnapshot(exceptionLog);
    exports.log.fatal(exceptionLog, 'Uncaught exception');
  } catch (e) {
    console.error(e);
  }

  if (_cluster.default.isMaster || !exports.httpServer) {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  } else {
    exports.httpServer.close(function () {
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
    setTimeout(function () {
      exports.log.error('HTTP server is stalling upon closing down. Forcefully terminating.'); // eslint-disable-line max-len
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
  }
};exports.onUncaughtException = onUncaughtException;

let onHeartbeat = function () {
  return function () {
    let level = 'info';
    let heartbeatLog = {
      tag_server_heartbeat: true,
      process: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime() },

      os: {
        loadavg: _os.default.loadavg(),
        totalmem: _os.default.totalmem(),
        freemem: _os.default.freemem() } };



    if (exports.maybeWriteHeapSnapshot(heartbeatLog)) {
      level = 'warn';
    }

    exports.log[level](heartbeatLog, 'Heartbeat');
  };
}();

// MAIN
exports.onHeartbeat = onHeartbeat;
let mainWorker = async function () {
  process.on('uncaughtException', exports.onUncaughtException);

  let app = _expressApp.default.create({
    address: _env.default.address,
    port: _env.default.port,
    env: _env.default,
    log: exports.log });


  // [{awsFunctionName, isProd, locations, mainFun, pkg}]
  let lambdas = await _env.default.hooks.findLambdas({ env: _env.default });

  _lodashFirecloud.default.forEach(lambdas, function (lambda) {
    let makeHandle = _proxy.default;

    makeHandle = _local.default;
    if (lambda.isProd) {
      makeHandle = _proxy.default;
    }
    lambda.handle = makeHandle({ app, lambda });
  });

  await _expressApp.default.loadLambdas({ app, lambdas });

  _http.default.globalAgent.maxSockets = Infinity;
  exports.httpServer = httpServer = _http.default.createServer(app);

  exports.httpServer.listen(_env.default.port, _env.default.address);

  if (!_cluster.default.isMaster) {
    return;
  }

  exports.log.info({
    tag_server_event: 'listening' },
  'Non-worker listening');

  if (_env.default.heartbeat.interval > 1) {
    setInterval(exports.onHeartbeat, _env.default.heartbeat.interval * 60 * 1000);
  }
};exports.mainWorker = mainWorker;

let onSimpleEvent = function (event, worker) {
  let level = 'info';
  // eslint-disable-next-line fp/no-arguments
  let args = Array.prototype.slice.call(arguments, 1);

  if (worker instanceof _cluster.default.Worker) {
    args.shift();
  }

  args = args.length ? ` ${JSON.stringify(args)}` : '';

  if (event === 'error') {
    level = 'error';
  }
  // eslint-disable-next-line fp/no-arguments
  if (event === 'exit' && arguments[0] !== 0) {
    level = 'error';
  }

  exports.log[level]({
    tagServerWorker: true,
    tag_server_event: event,
    workerId: worker.id },
  `Worker ${event}${args}`);
};exports.onSimpleEvent = onSimpleEvent;

let mainMaster = function () {
  let startupLog = {
    tag_server_event: 'starting',
    env: _env.default };


  // Exit when pipe is closed
  if (_env.default.isProd) {
    process.stdin.resume();
    process.stdin.on('close', function () {
      // eslint-disable-next-line fp/no-arguments
      _lodashFirecloud.default.curry(exports.onSimpleEvent)('stdin_close')(arguments);
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    });
  }

  process.on('uncaughtException', exports.onUncaughtException);
  _cluster.default.
  on('fork', _lodashFirecloud.default.curry(exports.onSimpleEvent)('fork')).
  on('online', _lodashFirecloud.default.curry(exports.onSimpleEvent)('online')).
  on('listening', _lodashFirecloud.default.curry(exports.onSimpleEvent)('listening')).
  on('disconnect', _lodashFirecloud.default.curry(exports.onSimpleEvent)('disconnect')).
  on('exit', _lodashFirecloud.default.curry(exports.onSimpleEvent)('exit')).
  on('exit', function (worker, code, _signal) {
    if (code === 0) {
      return;
    }

    // Replace event
    let event = 'replace';
    let newWorker = _cluster.default.fork();
    let args = ` [${newWorker.id}]`;

    exports.log.info({
      tagServerWorker: true,
      tag_server_event: event,
      workerId: worker.id },
    `Worker ${event}${args}`);
  });

  if (_env.default.isProd) {
    startupLog.process = {
      arch: process.arch,
      env: process.env,
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      versions: process.versions,
      uptime: process.uptime() };

    startupLog.process.env.NODE_PATH =
    _lodashFirecloud.default.compact(_lodashFirecloud.default.uniq(_lodashFirecloud.default.split(startupLog.process.env.NODE_PATH, ':')));

    startupLog.os = {
      arch: _os.default.arch(),
      cpus: _os.default.cpus(),
      freemem: _os.default.freemem(),
      hostame: _os.default.hostname(),
      loadavg: _os.default.loadavg(),
      networkInterfaces: _os.default.networkInterfaces(),
      platform: _os.default.platform(),
      release: _os.default.release(),
      totalmem: _os.default.totalmem(),
      type: _os.default.type(),
      uptime: _os.default.uptime() };

  }

  exports.log.trace(startupLog, 'Starting');

  _lodashFirecloud.default.forEach(_lodashFirecloud.default.range(0, _env.default.forkCount), function () {
    _cluster.default.fork();
  });
};

// RUN
exports.mainMaster = mainMaster;
let run = function () {
  if (_cluster.default.isMaster) {
    console.log(`PID=${process.pid}`);
    console.log(`PORT=${_env.default.port}`);
    console.log('---');

    if (!_env.default.isProd) {
      console.log(`Started server on http://${_env.default.address}:${_env.default.port}`);
      console.log('Press CTRL-C to stop');
      console.log(`To debug, run: kill -SIGUSR1 ${process.pid}`);
      console.log('---');
    }

    exports.mainMaster();
    if (_env.default.forkCount > 0) {
      return;
    }
  }
  exports.mainWorker();
};exports.run = run;


if (_env.default.port) {
  exports.run();
} else {
  // random port support
  let tmpServer = _http.default.createServer();
  tmpServer.listen(0).on('listening', function () {
    _env.default.port = tmpServer.address().port.toString();
    tmpServer.close();
  }).on('close', exports.run);
}

//# sourceMappingURL=index.js.map
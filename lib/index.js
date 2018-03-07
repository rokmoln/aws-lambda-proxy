'use strict';

var _bluebird = require('bluebird/js/release/bluebird');

var _lodashFirecloud = require('lodash-firecloud');

var _lodashFirecloud2 = _interopRequireDefault(_lodashFirecloud);

var _bunyan = require('bunyan');

var _bunyan2 = _interopRequireDefault(_bunyan);

var _cluster = require('cluster');

var _cluster2 = _interopRequireDefault(_cluster);

var _env = require('./env');

var _env2 = _interopRequireDefault(_env);

var _expressApp = require('./express-app');

var _expressApp2 = _interopRequireDefault(_expressApp);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _local = require('./handlers/local');

var _local2 = _interopRequireDefault(_local);

var _proxy = require('./handlers/proxy');

var _proxy2 = _interopRequireDefault(_proxy);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _package = require('../package.json');

var _package2 = _interopRequireDefault(_package);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let heapdump;
if (_env2.default.heartbeat.memThresholdRss && _env2.default.log.toDir) {
  try {
    // eslint-disable-next-line dependencies/no-unresolved, import/no-extraneous-dependencies
    heapdump = require('heapdump');
  } catch (_err) {}
}
let workerId = _lodashFirecloud2.default.get(_cluster2.default, 'worker.id', 'M');
let httpServer;

// LOG

let logStreams = [{
  name: 'stdout',
  stream: process.stdout,
  level: _lodashFirecloud2.default.defaultTo(_env2.default.log.level, 'TRACE')
}];

if (_env2.default.log.toDir) {
  logStreams.push({
    name: 'default',
    path: _path2.default.join(_env2.default.log.toDir, `${_package2.default.name}.log`),
    period: '1d',
    count: 7,
    level: _env2.default.log.level
  });
}

let log = _bunyan2.default.createLogger({
  name: _package2.default.name,
  src: true,
  serializers: undefined,
  streams: logStreams
});

if (!_cluster2.default.isMaster) {
  log = log.child({
    tagServerWorker: true,
    workerId
  });
}

// EVENT HANDLERS

let writeHeapSnapshot = function (logObj) {
  if (!heapdump) {
    return;
  }

  let filename = `${_package2.default.name}.${workerId}.uncaughtException.heapsnapshot`;
  logObj.heapsnapshot = {
    filename
  };
  heapdump.writeSnapshot(`${_env2.default.log.toDir}/${filename}`);
};

let maybeWriteHeapSnapshot = function (logObj) {
  if (!heapdump) {
    return;
  }

  let thresholdRss = _env2.default.heartbeat.memThresholdRss;
  let currentRss;
  currentRss = logObj.process.memoryUsage.rss / (1024 * 1024);
  if (currentRss <= thresholdRss) {
    return false;
  }
  let filename = `${_package2.default.name}.${workerId}.${thresholdRss}MB.heapsnapshot`;
  logObj.heapsnapshot = {
    currentRss,
    thresholdRss,
    filename
  };
  heapdump.writeSnapshot(`${_env2.default.log.toDir}/${filename}`);
  thresholdRss = thresholdRss + 25;
  return true;
};

let onUncaughtException = function (err) {
  let exceptionLog = {
    tag_uncaught_exception: true,
    err: {
      code: err.code,
      message: err.message,
      stack: err.stack
    }
  };

  // eslint-disable-next-line no-console
  console.error(err);
  // eslint-disable-next-line no-console
  console.error(err.stack);
  try {
    writeHeapSnapshot(exceptionLog);
    log.fatal(exceptionLog, 'Uncaught exception');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  if (_cluster2.default.isMaster || !httpServer) {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  } else {
    httpServer.close(function () {
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
    setTimeout(function () {
      log.error('HTTP server is stalling upon closing down. Forcefully terminating.'); // eslint-disable-line max-len
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
  }
};

let onHeartbeat = function () {
  return function () {
    let level = 'info';
    let heartbeatLog = {
      tag_server_heartbeat: true,
      process: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      os: {
        loadavg: _os2.default.loadavg(),
        totalmem: _os2.default.totalmem(),
        freemem: _os2.default.freemem()
      }
    };

    if (maybeWriteHeapSnapshot(heartbeatLog)) {
      level = 'warn';
    }

    log[level](heartbeatLog, 'Heartbeat');
  };
}();

// MAIN

let mainWorker = (() => {
  var _ref = (0, _bluebird.coroutine)(function* () {
    process.on('uncaughtException', onUncaughtException);

    let app = _expressApp2.default.create({
      address: _env2.default.address,
      port: _env2.default.port,
      env: _env2.default,
      log
    });

    // [{awsFunctionName, isProd, locations, mainFun, pkg}]
    let lambdas = yield _env2.default.hooks.findLambdas({ env: _env2.default });

    _lodashFirecloud2.default.forEach(lambdas, function (lambda) {
      let makeHandle = _proxy2.default;

      makeHandle = _local2.default;
      if (lambda.isProd) {
        makeHandle = _proxy2.default;
      }
      lambda.handle = makeHandle({ app, lambda });
    });

    yield _expressApp2.default.loadLambdas({ app, lambdas });

    _http2.default.globalAgent.maxSockets = Infinity;
    httpServer = _http2.default.createServer(app);

    httpServer.listen(_env2.default.port, _env2.default.address);

    if (!_cluster2.default.isMaster) {
      return;
    }

    log.info({
      tag_server_event: 'listening'
    }, 'Non-worker listening');

    if (_env2.default.heartbeat.interval > 1) {
      setInterval(onHeartbeat, _env2.default.heartbeat.interval * 60 * 1000);
    }
  });

  return function mainWorker() {
    return _ref.apply(this, arguments);
  };
})();

let onSimpleEvent = function (event, worker) {
  let level = 'info';
  // eslint-disable-next-line fp/no-arguments
  let args = Array.prototype.slice.call(arguments, 1);

  if (worker instanceof _cluster2.default.Worker) {
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

  log[level]({
    tagServerWorker: true,
    tag_server_event: event,
    workerId: worker.id
  }, `Worker ${event}${args}`);
};

let mainMaster = function () {
  let startupLog = {
    tag_server_event: 'starting',
    env: _env2.default
  };

  // Exit when pipe is closed
  if (_env2.default.isProd) {
    process.stdin.resume();
    process.stdin.on('close', function () {
      // eslint-disable-next-line fp/no-arguments
      _lodashFirecloud2.default.curry(onSimpleEvent)('stdin_close')(arguments);
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    });
  }

  process.on('uncaughtException', onUncaughtException);
  _cluster2.default.on('fork', _lodashFirecloud2.default.curry(onSimpleEvent)('fork')).on('online', _lodashFirecloud2.default.curry(onSimpleEvent)('online')).on('listening', _lodashFirecloud2.default.curry(onSimpleEvent)('listening')).on('disconnect', _lodashFirecloud2.default.curry(onSimpleEvent)('disconnect')).on('exit', _lodashFirecloud2.default.curry(onSimpleEvent)('exit')).on('exit', function (worker, code, _signal) {
    if (code === 0) {
      return;
    }

    // Replace event
    let event = 'replace';
    let newWorker = _cluster2.default.fork();
    let args = ` [${newWorker.id}]`;

    log.info({
      tagServerWorker: true,
      tag_server_event: event,
      workerId: worker.id
    }, `Worker ${event}${args}`);
  });

  if (_env2.default.isProd) {
    startupLog.process = {
      arch: process.arch,
      env: process.env,
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      versions: process.versions,
      uptime: process.uptime()
    };
    startupLog.process.env.NODE_PATH = _lodashFirecloud2.default.compact(_lodashFirecloud2.default.uniq(_lodashFirecloud2.default.split(startupLog.process.env.NODE_PATH, ':')));

    startupLog.os = {
      arch: _os2.default.arch(),
      cpus: _os2.default.cpus(),
      freemem: _os2.default.freemem(),
      hostame: _os2.default.hostname(),
      loadavg: _os2.default.loadavg(),
      networkInterfaces: _os2.default.networkInterfaces(),
      platform: _os2.default.platform(),
      release: _os2.default.release(),
      totalmem: _os2.default.totalmem(),
      type: _os2.default.type(),
      uptime: _os2.default.uptime()
    };
  }

  log.trace(startupLog, 'Starting');

  _lodashFirecloud2.default.forEach(_lodashFirecloud2.default.range(0, _env2.default.forkCount), function () {
    _cluster2.default.fork();
  });
};

// RUN

let run = function () {
  if (_cluster2.default.isMaster) {
    // eslint-disable-next-line no-console
    console.log(`PID=${process.pid}`);
    // eslint-disable-next-line no-console
    console.log(`PORT=${_env2.default.port}`);
    // eslint-disable-next-line no-console
    console.log('---');

    if (!_env2.default.isProd) {
      // eslint-disable-next-line no-console
      console.log(`Started server on http://${_env2.default.address}:${_env2.default.port}`);
      // eslint-disable-next-line no-console
      console.log('Press CTRL-C to stop');
      // eslint-disable-next-line no-console
      console.log(`To debug, run: kill -SIGUSR1 ${process.pid}`);
      // eslint-disable-next-line no-console
      console.log('---');
    }

    mainMaster();
    if (_env2.default.forkCount > 0) {
      return;
    }
  }
  mainWorker();
};

if (_env2.default.port) {
  run();
} else {
  // random port support
  let tmpServer = _http2.default.createServer();
  tmpServer.listen(0).on('listening', function () {
    _env2.default.port = tmpServer.address().port.toString();
    tmpServer.close();
  }).on('close', run);
}

//# sourceMappingURL=index.js.map
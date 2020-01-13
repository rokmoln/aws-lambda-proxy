import _ from 'lodash-firecloud';
import cluster from 'cluster';
import env from './env';
import expressApp from './express-app';
import http from 'http';
import log from './log';
import makeLocalHandle from './handlers/local';
import makeProxyHandle from './handlers/proxy';
import os from 'os';
import pkg from '../package.json';

let heapdump;
if (env.heartbeat.memThresholdRss && env.log.toDir) {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    heapdump = require('heapdump');
  } catch (_err) {
  }
}
let workerId = _.get(cluster, 'worker.id', 'M');
let httpServer;

// EVENT HANDLERS

let writeHeapSnapshot = function(logObj) {
  if (!heapdump) {
    return;
  }

  let filename = `${pkg.name}.${workerId}.uncaughtException.heapsnapshot`;
  logObj.heapsnapshot = {
    filename
  };
  heapdump.writeSnapshot(`${env.log.toDir}/${filename}`);
};

let maybeWriteHeapSnapshot = function(logObj) {
  if (!heapdump) {
    return;
  }

  let thresholdRss = env.heartbeat.memThresholdRss;
  let currentRss;
  currentRss = logObj.process.memoryUsage.rss / (1024 * 1024);
  if (currentRss <= thresholdRss) {
    return false;
  }
  let filename = `${pkg.name}.${workerId}.${thresholdRss}MB.heapsnapshot`;
  logObj.heapsnapshot = {
    currentRss,
    thresholdRss,
    filename
  };
  heapdump.writeSnapshot(`${env.log.toDir}/${filename}`);
  thresholdRss = thresholdRss + 25;
  return true;
};

let onUncaughtException = function(err) {
  let exceptionLog = {
    tag_uncaught_exception: true,
    err: {
      code: err.code,
      message: err.message,
      stack: err.stack
    }
  };

  console.error(err);
  console.error(err.stack);
  try {
    writeHeapSnapshot(exceptionLog);
    log.fatal(exceptionLog, 'Uncaught exception');
  } catch (e) {
    console.error(e);
  }

  if (cluster.isMaster || !httpServer) {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  } else {
    httpServer.close(function() {
    // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
    setTimeout(function() {
      log.error('HTTP server is stalling upon closing down. Forcefully terminating.');
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    });
  }
};

let onHeartbeat = (function() {
  return function() {
    let level = 'info';
    let heartbeatLog = {
      tag_server_heartbeat: true,
      process: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      },
      os: {
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem()
      }
    };

    if (maybeWriteHeapSnapshot(heartbeatLog)) {
      level = 'warn';
    }

    log[level](heartbeatLog, 'Heartbeat');
  };
})();

// MAIN

let mainWorker = async function() {
  process.on('uncaughtException', onUncaughtException);

  let app = expressApp.create({
    address: env.address,
    port: env.port,
    env,
    log
  });

  // [{awsFunctionName, isProd, locations, mainFun, pkg}]
  let lambdas = await env.hooks.findLambdas({env});

  _.forEach(lambdas, function(lambda) {
    let makeHandle = makeProxyHandle;

    makeHandle = makeLocalHandle;
    if (lambda.isProd) {
      makeHandle = makeProxyHandle;
    }
    lambda.handle = makeHandle({app, lambda});
  });

  await expressApp.loadLambdas({app, lambdas});

  http.globalAgent.maxSockets = Infinity;
  httpServer = http.createServer(app);

  httpServer.listen(env.port, env.address);

  if (!cluster.isMaster) {
    return;
  }

  log.info({
    tag_server_event: 'listening'
  }, 'Non-worker listening');

  if (env.heartbeat.interval > 1) {
    setInterval(onHeartbeat, env.heartbeat.interval * 60 * 1000);
  }
};

let onSimpleEvent = function(event, worker) {
  let level = 'info';
  // eslint-disable-next-line fp/no-arguments, prefer-rest-params
  let args = Array.prototype.slice.call(arguments, 1);

  if (worker instanceof cluster.Worker) {
    args.shift();
  }

  args = args.length ? ` ${JSON.stringify(args)}` : '';

  if (event === 'error') {
    level = 'error';
  }
  // eslint-disable-next-line fp/no-arguments, prefer-rest-params
  if (event === 'exit' && arguments[0] !== 0) {
    level = 'error';
  }

  log[level]({
    tagServerWorker: true,
    tag_server_event: event,
    workerId: worker.id
  }, `Worker ${event}${args}`);
};

let mainMaster = function() {
  let startupLog = {
    tag_server_event: 'starting',
    env
  };

  // Exit when pipe is closed
  if (env.isProd) {
    process.stdin.resume();
    process.stdin.on('close', function() {
      // eslint-disable-next-line fp/no-arguments, prefer-rest-params
      _.curry(onSimpleEvent)('stdin_close')(arguments);
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    });
  }

  process.on('uncaughtException', onUncaughtException);
  cluster
    .on('fork', _.curry(onSimpleEvent)('fork'))
    .on('online', _.curry(onSimpleEvent)('online'))
    .on('listening', _.curry(onSimpleEvent)('listening'))
    .on('disconnect', _.curry(onSimpleEvent)('disconnect'))
    .on('exit', _.curry(onSimpleEvent)('exit'))
    .on('exit', function(worker, code, _signal) {
      if (code === 0) {
        return;
      }

      // Replace event
      let event = 'replace';
      let newWorker = cluster.fork();
      let args = ` [${newWorker.id}]`;

      log.info({
        tagServerWorker: true,
        tag_server_event: event,
        workerId: worker.id
      }, `Worker ${event}${args}`);
    });

  if (env.isProd) {
    startupLog.process = {
      arch: process.arch,
      env: process.env,
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      versions: process.versions,
      uptime: process.uptime()
    };
    startupLog.process.env.NODE_PATH =
      _.compact(_.uniq(_.split(startupLog.process.env.NODE_PATH, ':')));

    startupLog.os = {
      arch: os.arch(),
      cpus: os.cpus(),
      freemem: os.freemem(),
      hostame: os.hostname(),
      loadavg: os.loadavg(),
      networkInterfaces: os.networkInterfaces(),
      platform: os.platform(),
      release: os.release(),
      totalmem: os.totalmem(),
      type: os.type(),
      uptime: os.uptime()
    };
  }

  log.trace(startupLog, 'Starting');

  _.forEach(_.range(0, env.forkCount), function() {
    cluster.fork();
  });
};

// RUN

let run = function() {
  if (cluster.isMaster) {
    console.log(`PID=${process.pid}`);
    console.log(`PORT=${env.port}`);
    console.log('---');

    if (!env.isProd) {
      console.log(`Started server on http://${env.address}:${env.port}`);
      console.log('Press CTRL-C to stop');
      console.log(`To debug, run: kill -SIGUSR1 ${process.pid}`);
      console.log('---');
    }

    mainMaster();
    if (env.forkCount > 0) {
      return;
    }
  }
  mainWorker();
};


if (env.port) {
  run();
} else {
  // random port support
  let tmpServer = http.createServer();
  tmpServer.listen(0).on('listening', function() {
    env.port = tmpServer.address().port.toString();
    tmpServer.close();
  }).on('close', run);
}

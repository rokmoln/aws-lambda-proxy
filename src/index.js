/* eslint global-require:off, no-process-exit:off */

import _ from 'lodash';
import bunyan from 'bunyan';
import cluster from 'cluster';
import env from './env';
import expressApp from './express-app';

import http from 'http';
import os from 'os';
import path from 'path';
import pkg from '../package.json';

let heapdump;
if (env.heartbeat.mem_threshold_rss && env.log.to_dir) {
  heapdump = require('heapdump');
}
let workerId = cluster.worker && cluster.worker.id || 'M';
let httpServer;

Error.stackTraceLimit = Infinity;

// LOG

let logStreams = [{
  name: 'stdout',
  stream: process.stdout,
  level: 'TRACE'
}];

if (env.log.to_dir) {
  logStreams.push({
    name: 'default',
    type: 'rotating-file',
    path: path.join(env.log.to_dir, `${pkg.name}.log`),
    period: '1d',
    count: 7,
    level: env.log.level
  });
}

let log = bunyan.createLogger({
  name: pkg.name,
  src: true,
  serializers: null,
  streams: logStreams
});

if (!cluster.isMaster) {
  log = log.child({
    tag_server_worker: true,
    worker_id: workerId
  });
}

// EVENT HANDLERS

let writeHeapSnapshot = function(logObj) {
  let filename = `${pkg.name}.${workerId}.uncaughtException.heapsnapshot`;
  logObj.heapsnapshot = {
    filename
  };
  heapdump.writeSnapshot(`${env.log.to_dir}/${filename}`);
};

let maybeWriteHeapSnapshot = function(logObj) {
  let thresholdRss = env.heartbeat.mem_threshold_rss;
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
  heapdump.writeSnapshot(`${env.log.to_dir}/${filename}`);
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
    if (heapdump) {
      writeHeapSnapshot(exceptionLog);
    }
    log.fatal(exceptionLog, 'Uncaught exception');
  } catch (e) {
    console.error(e);
  }

  if (cluster.isMaster) {
    process.exit(1);
  } else {
    httpServer.close(function() {
      process.exit(1);
    });
    setTimeout(function() {
      log.error('HTTP server is stalling upon closing down. Forcefully terminating.'); // eslint-disable-line max-len
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

    if (heapdump) {
      if (maybeWriteHeapSnapshot(heartbeatLog)) {
        level = 'warn';
      }
    }

    log[level](heartbeatLog, 'Heartbeat');
  };
})();

// MAIN

let main = function() {
  process.on('uncaughtException', onUncaughtException);
};

let mainWorker = function() {
  main();
  let app = expressApp.create({
    address: env.address,
    port: env.port,
    env,
    log
  });

  app.loadLambdas(_.map(env.lambdas, function({name, pkg}) {
    let isProd = env.is_prod || pkg.config.is_prod;
    return {
      name,
      pkg,
      handle: isProd ?
        expressApp.makeLambdaProxyHandle(app, name) :
        require(name).handle
    };
  }));

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
  let args = Array.prototype.slice.call(arguments, 1);

  if (worker instanceof cluster.Worker) {
    args.shift();
  }

  args = args.length ? ` ${JSON.stringify(args)}` : '';

  if (event === 'error') {
    level = 'error';
  }
  if (event === 'exit' && arguments[0] !== 0) {
    level = 'error';
  }

  log[level]({
    tag_server_worker: true,
    tag_server_event: event,
    worker_id: worker.id
  }, `Worker ${event}${args}`);
};

let mainMaster = function() {
  let startupLog = {
    tag_server_event: 'starting',
    env
  };

  // Exit when pipe is closed
  if (env.is_prod) {
    process.stdin.resume();
    process.stdin.on('close', function() {
      _.curry(onSimpleEvent)('stdin_close')(arguments);
      process.exit(0);
    });
  }

  main();
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
        tag_server_worker: true,
        tag_server_event: event,
        worker_id: worker.id
      }, `Worker ${event}${args}`);
    });

  if (env.is_prod) {
    startupLog.process = {
      arch: process.arch,
      env: process.env,
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      versions: process.versions,
      uptime: process.uptime()
    };
    startupLog.process.env.NODE_PATH =
      _.compact(_.uniq(startupLog.process.env.NODE_PATH.split(':')));

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

  log.info(startupLog, 'Starting');

  for (let i = 0; i < env.fork_count; i++) {
    cluster.fork();
  }
};

// RUN

let run = function() {
  if (cluster.isMaster) {
    console.log(`PID=${process.pid}`);
    console.log(`PORT=${env.port}`);
    console.log('---');

    if (!env.is_prod) {
      console.log(`Started server on http://${env.address}:${env.port}`);
      console.log('Press CTRL-C to stop');
      console.log(`To debug, run: kill -SIGUSR1 ${process.pid}`);
      console.log('---');
    }

    mainMaster();
    if (env.fork_count > 0) {
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

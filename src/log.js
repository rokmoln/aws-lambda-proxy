import _ from 'lodash-firecloud';
import cluster from 'cluster';
import env from './env';
import pkg from '../package.json';

import {
  MinLog,
  logToConsole,
  serializeErr,
  serializeTime
} from 'minlog';

let _log = new MinLog({
  serializers: [
    serializeTime,
    serializeErr,
    async function({entry, _logger, _rawEntry}) {
      _.merge(entry, {
        name: pkg.name
      });

      return entry;
    }
  ],
  listeners: [
    logToConsole({
      level: _.defaultTo(env.log.level, 'TRACE')
    })
  ]
});

if (!cluster.isMaster) {
  _log = _log.child({
    serializers: [
      async function({entry, _logger, _rawEntry}) {
        _.merge(entry, {
          tagServerWorker: true,
          workerId: _.get(cluster, 'worker.id', 'M')
        });

        return entry;
      }
    ]
  });
}

export default _log;

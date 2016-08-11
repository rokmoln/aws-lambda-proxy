process.env.LOG_LEVEL = 'TRACE'; // FIXME

if (!/^prod/.test(process.env.NODE_ENV)) {
  require('babel-register'); // eslint-disable-line global-require
}
module.exports = require('./src/index');

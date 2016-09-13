try {
  require('babel-register'); // eslint-disable-line global-require
} catch (_e) {
  // assume already transpiled
}

module.exports = require('./src/index');

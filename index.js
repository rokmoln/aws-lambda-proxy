/* eslint-disable */
try {
  require('babel-register'); // eslint-disable-line global-require
} catch (_e) {
  //
}

// BEGIN -- APEX original
try {
  var config = require('./.env.json')
  for (var key in config) {
    process.env[key] = config[key]
  }
} catch (err) {
  // ignore
}
// END -- APEX original

module.exports = require('./src/index');

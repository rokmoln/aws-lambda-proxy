"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports._log = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _cluster = _interopRequireDefault(require("cluster"));
var _env = _interopRequireDefault(require("./env"));
var _package = _interopRequireDefault(require("../package.json"));

var _minlog = require("minlog");function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}






let _log = new _minlog.MinLog({
  serializers: [
  _minlog.serializeTime,
  _minlog.serializeErr,
  async function ({ entry, _logger, _rawEntry }) {
    _lodashFirecloud.default.merge(entry, {
      name: _package.default.name });


    return entry;
  }],

  listeners: [
  (0, _minlog.logToConsole)({
    level: _lodashFirecloud.default.defaultTo(_env.default.log.level, 'TRACE') })] });exports._log = _log;




if (!_cluster.default.isMaster) {
  exports._log = _log = exports._log.child({
    serializers: [
    async function ({ entry, _logger, _rawEntry }) {
      _lodashFirecloud.default.merge(entry, {
        tagServerWorker: true,
        workerId: _lodashFirecloud.default.get(_cluster.default, 'worker.id', 'M') });


      return entry;
    }] });


}var _default = exports._log;exports.default = _default;

//# sourceMappingURL=log.js.map
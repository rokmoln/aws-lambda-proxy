'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeLocalHandler = exports._awsLambda = undefined;

var _lodashFirecloud = require('lodash-firecloud');

var _lodashFirecloud2 = _interopRequireDefault(_lodashFirecloud);

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let _awsLambda = exports._awsLambda = new _awsSdk2.default.Lambda();

let makeLocalHandler = exports.makeLocalHandler = function ({ lambda: { mainFun, awsFunctionName } }) {
  return function (e, ctx = {}, cb = _lodashFirecloud2.default.noop) {
    exports._awsLambda.getFunctionConfiguration({
      FunctionName: awsFunctionName,
      Qualifier: '$LATEST'
    }, function (err, data) {
      if (err) {
        throw err;
      }

      ctx = _lodashFirecloud2.default.defaultsDeep({
        env: data.Environment.Variables
      }, ctx);
      mainFun(e, ctx, cb);
    });
  };
};

exports.default = exports.makeLocalHandler;

//# sourceMappingURL=local.js.map
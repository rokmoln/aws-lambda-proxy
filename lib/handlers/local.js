"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.makeLocalHandler = exports._awsLambda = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _awsSdk = _interopRequireDefault(require("aws-sdk"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

let _awsLambda = new _awsSdk.default.Lambda();exports._awsLambda = _awsLambda;

let makeLocalHandler = function ({ lambda: { mainFun, awsFunctionName } }) {
  return function (e, ctx = {}, cb = _lodashFirecloud.default.noop) {
    exports._awsLambda.getFunctionConfiguration({
      FunctionName: awsFunctionName,
      Qualifier: '$LATEST' },
    function (err, data) {
      if (err) {
        throw err;
      }

      ctx = _lodashFirecloud.default.defaultsDeep({
        env: data.Environment.Variables },
      ctx);
      mainFun(e, ctx, cb);
    });
  };
};exports.makeLocalHandler = makeLocalHandler;var _default = exports.makeLocalHandler;exports.default = _default;

//# sourceMappingURL=local.js.map
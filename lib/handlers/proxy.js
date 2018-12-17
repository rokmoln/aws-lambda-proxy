"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.makeProxyHandler = exports._awsLambda = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _awsSdk = _interopRequireDefault(require("aws-sdk"));
var _url = _interopRequireDefault(require("url"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

let _awsLambda = new _awsSdk.default.Lambda();exports._awsLambda = _awsLambda;

let makeProxyHandler = function ({ app, lambda: { awsFunctionName } }) {
  return function (e, ctx = {}, cb = _lodashFirecloud.default.noop) {
    let basePath = _url.default.parse(e.stageVariables.API_BASE_URL).pathname;
    if (basePath !== '/') {
      e.path = `${basePath}${e.path}`;
    }

    app.log.trace({
      tag_lambda: 'request',
      req: e });


    e = _lodashFirecloud.default.merge(
    {},
    _lodashFirecloud.default.omit(e, ['requestContext']),
    { ctx });


    exports._awsLambda.invoke({
      FunctionName: awsFunctionName,
      ClientContext: undefined,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: JSON.stringify(e),
      Qualifier: '$LATEST' },
    function (err, data) {
      if (err) {
        app.log.error({ err });
        return cb(err);
      }

      let body = data.Payload ? JSON.parse(data.Payload) : undefined;
      delete data.Payload;

      app.log.trace({
        tag_lambda: 'response',
        res: body,
        lambda_data: data });


      cb(undefined, body);
    });
  };
};exports.makeProxyHandler = makeProxyHandler;var _default = exports.makeProxyHandler;exports.default = _default;

//# sourceMappingURL=proxy.js.map
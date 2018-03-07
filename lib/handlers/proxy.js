'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeProxyHandler = undefined;

var _lodashFirecloud = require('lodash-firecloud');

var _lodashFirecloud2 = _interopRequireDefault(_lodashFirecloud);

var _awsSdk = require('aws-sdk');

var _awsSdk2 = _interopRequireDefault(_awsSdk);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let awsLambda = new _awsSdk2.default.Lambda();

let makeProxyHandler = exports.makeProxyHandler = function ({ app, lambda: { awsFunctionName } }) {
  return function (e, ctx = {}, cb = _lodashFirecloud2.default.noop) {
    let basePath = _url2.default.parse(e.stageVariables.API_BASE_URL).pathname;
    if (basePath !== '/') {
      e.path = `${basePath}${e.path}`;
    }

    app.log.trace({
      tag_lambda: 'request',
      req: e
    });

    e = _lodashFirecloud2.default.merge({}, _lodashFirecloud2.default.omit(e, ['requestContext']), { ctx });

    awsLambda.invoke({
      FunctionName: awsFunctionName,
      ClientContext: undefined,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: JSON.stringify(e),
      Qualifier: '$LATEST'
    }, function (err, data) {
      if (err) {
        app.log.error({ err });
        return cb(err);
      }

      let body = data.Payload ? JSON.parse(data.Payload) : undefined;
      delete data.Payload;

      app.log.trace({
        tag_lambda: 'response',
        res: body,
        lambda_data: data
      });

      cb(undefined, body);
    });
  };
};

exports.default = makeProxyHandler;

//# sourceMappingURL=proxy.js.map
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.middleware = exports.loadLambdas = exports.create = exports.express = undefined;

var _bluebird = require('bluebird/js/release/bluebird');

var _lodashFirecloud = require('lodash-firecloud');

var _lodashFirecloud2 = _interopRequireDefault(_lodashFirecloud);

var _express2 = require('express');

var _express3 = _interopRequireDefault(_express2);

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _compression = require('compression');

var _compression2 = _interopRequireDefault(_compression);

var _env = require('./env');

var _env2 = _interopRequireDefault(_env);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

let express = exports.express = _express3.default;

let create = exports.create = function (options) {
  let app = exports.express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('trust proxy');
  app.use((0, _compression2.default)());
  app.use(_bodyParser2.default.raw({ type: '*/*' }));

  app.env = options.env;
  app.log = options.log;

  app.use(function (req, _res, next) {
    // bodyParser return {} if no body
    if (_lodashFirecloud2.default.isEmpty(req.body)) {
      delete req.body;
    }

    if (req.path === '/health') {
      return next();
    }
    let slimReq = _lodashFirecloud2.default.omit(req, ['_parsedUrl', '_readableState', 'client', 'connection', 'host', 'res', 'socket']);
    if (slimReq.body instanceof Buffer) {
      slimReq.body = slimReq.body.toString();
    }
    options.log.debug({ req: slimReq });
    next();
  });

  app.get('/health', function (_req, res, _next) {
    res.sendStatus(200);
  });

  // eslint-disable-next-line max-params
  app.use(function (err, _req, res, _next) {
    if (_lodashFirecloud2.default.isNil(err)) {
      return res.sendStatus(404);
    }
    options.log.error({ err });
    return res.sendStatus(500);
  });

  return app;
};

let loadLambdas = exports.loadLambdas = (() => {
  var _ref = (0, _bluebird.coroutine)(function* ({ app, lambdas }) {
    let lambdaLocations = [];
    let arnPrefix = ['arn', 'aws', 'lambda', _lodashFirecloud2.default.defaultTo(process.env.AWS_REGION, 'zz-central-1'), process.env.AWS_ACCOUNT_ID, 'function'].join(':');

    _lodashFirecloud2.default.forEach(lambdas, function (lambda) {
      let {
        awsFunctionName,
        locations
      } = lambda;

      _lodashFirecloud2.default.forEach(locations, function (location) {
        // location = location.replace(/{([^}]+)\+}/g, ':$1');
        location = _lodashFirecloud2.default.replace(location, /{([^}]+)\+}/g, '*');
        location = `${location}$`;
        let ctx = {
          awsRequestId: '0',
          getRemainingTimeInMillis: function () {
            return 60 * 1000; // FIXME
          },
          functionName: awsFunctionName,
          functionVersion: '$LOCAL',
          invokedFunctionArn: `${arnPrefix}:${awsFunctionName}:$LOCAL`
        };

        lambdaLocations.push({
          ctx,
          lambda,
          location
        });
      });
    });

    Promise.all(_lodashFirecloud2.default.map(lambdaLocations, (() => {
      var _ref2 = (0, _bluebird.coroutine)(function* ({ ctx, lambda, location }) {
        let route = {
          ctx,
          lambda,
          location,
          expressRouter: app
        };

        yield _env2.default.hooks.preRouteSetup({ env: _env2.default, route });
        route.expressRouter.all(route.location, exports.middleware(route));
      });

      return function (_x2) {
        return _ref2.apply(this, arguments);
      };
    })()));
  });

  return function loadLambdas(_x) {
    return _ref.apply(this, arguments);
  };
})();

let middleware = exports.middleware = function (route) {
  route = _lodashFirecloud2.default.cloneDeep(route);

  return (() => {
    var _ref3 = (0, _bluebird.coroutine)(function* (req, res, _next) {
      let {
        pathname,
        query
      } = _url2.default.parse(req.originalUrl, true);

      let e = {
        httpMethod: req.method,
        path: pathname,
        queryStringParameters: query,
        headers: req.headers,
        body: req.body ? req.body.toString() : undefined,
        stageVariables: {},
        requestContext: {
          accountId: process.env.AWS_ACCOUNT_ID,
          stage: 'local',
          httpMethod: req.method
        }
      };

      yield _env2.default.hooks.preHandle({ e, env: _env2.default, route, req, res });

      route.lambda.handle(e, route.ctx, function (err, lambdaRes) {
        if (err) {
          req.app.log.error({ err });
          return res.status(500);
        }
        res.status(lambdaRes.statusCode);
        res.set(lambdaRes.headers);
        res.send(lambdaRes.body);
      });
    });

    return function (_x3, _x4, _x5) {
      return _ref3.apply(this, arguments);
    };
  })();
};

exports.default = exports;

//# sourceMappingURL=express-app.js.map
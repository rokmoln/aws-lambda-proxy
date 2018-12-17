"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports.default = exports.middleware = exports.loadLambdas = exports.create = exports.express = void 0;var _lodashFirecloud = _interopRequireDefault(require("lodash-firecloud"));
var _express2 = _interopRequireDefault(require("express"));
var _bodyParser = _interopRequireDefault(require("body-parser"));
var _compression = _interopRequireDefault(require("compression"));
var _env = _interopRequireDefault(require("./env"));
var _url = _interopRequireDefault(require("url"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { default: obj };}

let express = _express2.default;exports.express = express;

let create = function (options) {
  let app = exports.express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('trust proxy');
  app.use((0, _compression.default)());
  app.use(_bodyParser.default.raw({ type: '*/*' }));

  app.env = options.env;
  app.log = options.log;

  app.use(function (req, _res, next) {
    // bodyParser return {} if no body
    if (_lodashFirecloud.default.isEmpty(req.body)) {
      delete req.body;
    }

    if (req.path === '/health') {
      return next();
    }
    let slimReq = _lodashFirecloud.default.omit(req, [
    '_parsedUrl',
    '_readableState',
    'client',
    'connection',
    'host',
    'res',
    'socket']);

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
    if (_lodashFirecloud.default.isNil(err)) {
      return res.sendStatus(404);
    }
    options.log.error({ err });
    return res.sendStatus(500);
  });

  return app;
};exports.create = create;

let loadLambdas = async function ({ app, lambdas }) {
  let lambdaLocations = [];
  let arnPrefix = [
  'arn',
  'aws',
  'lambda',
  _lodashFirecloud.default.defaultTo(process.env.AWS_REGION, 'zz-central-1'),
  process.env.AWS_ACCOUNT_ID,
  'function'].
  join(':');

  _lodashFirecloud.default.forEach(lambdas, function (lambda) {
    let {
      awsFunctionName,
      locations } =
    lambda;

    _lodashFirecloud.default.forEach(locations, function (location) {
      // location = location.replace(/{([^}]+)\+}/g, ':$1');
      location = _lodashFirecloud.default.replace(location, /{([^}]+)\+}/g, '*');
      location = `${location}$`;
      let ctx = {
        awsRequestId: '0',
        getRemainingTimeInMillis: function () {
          return 60 * 1000; // FIXME
        },
        functionName: awsFunctionName,
        functionVersion: '$LOCAL',
        invokedFunctionArn: `${arnPrefix}:${awsFunctionName}:$LOCAL` };


      lambdaLocations.push({
        ctx,
        lambda,
        location });

    });
  });

  Promise.all(_lodashFirecloud.default.map(lambdaLocations, async function ({ ctx, lambda, location }) {
    let route = {
      ctx,
      lambda,
      location,
      expressRouter: app };


    await _env.default.hooks.preRouteSetup({ env: _env.default, route });
    route.expressRouter.all(route.location, exports.middleware(route));
  }));
};exports.loadLambdas = loadLambdas;

let middleware = function (route) {
  route = _lodashFirecloud.default.cloneDeep(route);

  return async function (req, res, _next) {
    let {
      pathname,
      query } =
    _url.default.parse(req.originalUrl, true);

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
        httpMethod: req.method } };



    await _env.default.hooks.preHandle({ e, env: _env.default, route, req, res });

    route.lambda.handle(e, route.ctx, function (err, lambdaRes) {
      if (err) {
        req.app.log.error({ err });
        return res.status(500);
      }
      res.status(lambdaRes.statusCode);
      res.set(lambdaRes.headers);
      res.send(lambdaRes.body);
    });
  };
};exports.middleware = middleware;var _default =

exports;exports.default = _default;

//# sourceMappingURL=express-app.js.map
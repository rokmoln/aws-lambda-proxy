import _ from 'lodash-firecloud';
import bodyParser from 'body-parser';
import compression from 'compression';
import env from './env';
import express from 'express';
import url from 'url';

export let create = function(options) {
  let app = express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('trust proxy');
  app.use(compression());
  app.use(bodyParser.raw({type: '*/*'}));

  app.env = options.env;
  app.log = options.log;

  app.use(function(req, _res, next) {
    // bodyParser return {} if no body
    if (_.isEmpty(req.body)) {
      delete req.body;
    }

    if (req.path === '/health') {
      return next();
    }
    let slimReq = _.omit(req, [
      '_parsedUrl',
      '_readableState',
      'client',
      'connection',
      'host',
      'res',
      'socket'
    ]);
    if (slimReq.body instanceof Buffer) {
      slimReq.body = slimReq.body.toString();
    }
    options.log.debug({req: slimReq});
    next();
  });

  app.get('/health', function(_req, res, _next) {
    res.sendStatus(200);
  });

  // eslint-disable-next-line max-params
  app.use(function(err, _req, res, _next) {
    if (_.isNil(err)) {
      return res.sendStatus(404);
    }
    options.log.error({err});
    return res.sendStatus(500);
  });

  return app;
};

export let loadLambdas = async function({app, lambdas}) {
  let lambdaLocations = [];
  let arnPrefix = [
    'arn',
    'aws',
    'lambda',
    _.defaultTo(process.env.AWS_REGION, 'zz-central-1'),
    process.env.AWS_ACCOUNT_ID,
    'function'
  ].join(':');

  _.forEach(lambdas, function(lambda) {
    let {
      awsFunctionName,
      locations
    } = lambda;

    _.forEach(locations, function(location) {
      // location = location.replace(/{([^}]+)\+}/g, ':$1');
      location = _.replace(location, /{([^}]+)\+}/g, '*');
      location = `${location}$`;
      let ctx = {
        awsRequestId: '0',
        getRemainingTimeInMillis: function() {
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

  Promise.all(_.map(lambdaLocations, async function({ctx, lambda, location}) {
    let route = {
      ctx,
      lambda,
      location,
      expressRouter: app
    };

    await env.hooks.preRouteSetup({env, route});
    route.expressRouter.all(route.location, exports.middleware(route));
  }));
};

export let middleware = function(route) {
  route = _.cloneDeep(route);

  return async function(req, res, _next) {
    let {
      pathname,
      query
    } = url.parse(req.originalUrl, true);

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

    await env.hooks.preHandle({e, env, route, req, res});

    route.lambda.handle(e, route.ctx, function(err, lambdaRes) {
      if (err) {
        req.app.log.error({err});
        return res.status(500);
      }
      res.status(lambdaRes.statusCode);
      res.set(lambdaRes.headers);
      res.send(lambdaRes.body);
    });
  };
};

export default exports;

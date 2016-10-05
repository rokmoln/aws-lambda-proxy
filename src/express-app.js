import _ from 'lodash';
import bodyParser from 'body-parser';
import compression from 'compression';
import express from 'express';
import url from 'url';
import {Lambda} from 'aws-sdk';

let awsLambda = new Lambda({apiVersion: '2015-03-31'});

export let base64 = function(string) {
  // maintain Node.js v4 compatibility
  // return Buffer.from(string).toString('base64').slice(0, -1);
  return new Buffer(string).toString('base64').slice(0, -1);
};

export let create = function(options) {
  let app = express();
  let hashedEnv = base64(process.env.ENV_NAME);

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

    if (req.path === `/health.${hashedEnv}`) {
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

  app.get(`/health.${hashedEnv}`, function(_req, res, _next) {
    res.sendStatus(200);
  });

  app.loadLambdas = function({lambdas, stageVariables}) {
    return exports.loadLambdas({
      app,
      lambdas,
      stageVariables
    });
  };

  app.use(function(err, _req, res, _next) {
    if (err == null) {
      return res.sendStatus(404);
    }
    options.log.error(err);
    return res.sendStatus(500);
  });

  return app;
};

export let loadLambdas = function({app, lambdas, stageVariables}) {
  let locations = [];
  let arnPrefix = `arn:aws:lambda:zz-central-1:${process.env.AWS_ACCOUNT_ID}:function`;

  _.each(lambdas, function({name, pkg, handle}) {
    _.each((pkg.config['aws-lambda'] || {}).locations, function(location) {
      location = location.replace(/{([^}]+)\+}/g, ':$1');
      let functionName = `${process.env.ENV_NAME}-${name}`;
      let ctx = {
        functionName,
        functionVersion: '$LOCAL',
        invokedFunctionArn: `${arnPrefix}:${functionName}:$LOCAL`
      };
      locations.push({
        location,
        stageVariables,
        ctx,
        handle
      });
    });
  });

  _.each(locations, function({location, stageVariables, ctx, handle}) {
    let router = new express.Router();
    router.all(location, exports.middleware({
      stageVariables,
      ctx,
      handle
    }));
    let basePath = url.parse(stageVariables.API_BASE_URL).pathname;
    if (basePath === '/') {
      app.use(router);
    } else {
      app.use(basePath, router);
    }
  });
};

export let middleware = function({stageVariables, ctx, handle}) {
  return function(req, res, _next) {
    let {
      pathname,
      query
    } = url.parse(req.originalUrl);

    handle({
      httpMethod: req.method,
      path: pathname,
      querystring: query,
      headers: req.headers,
      body: req.body ? req.body.toString() : undefined,
      stageVariables
    }, ctx, function(err, lambdaRes) {
      if (err) {
        req.app.log.error(err);
        return res.status(500);
      }
      res.status(lambdaRes.statusCode);
      res.set(lambdaRes.headers);
      res.send(lambdaRes.body);
    });
  };
};

export let makeLambdaProxyHandle = function(app, name) {
  return function(e, ctx = {}, cb = _.noop) {
    app.log.trace({
      tag_lambda: 'request',
      req: e
    });

    awsLambda.invoke({
      FunctionName: `${app.env.project.name}-${name}`,
      ClientContext: undefined,
      InvocationType: 'RequestResponse',
      LogType: 'None',
      Payload: JSON.stringify(_.merge({}, e, {ctx})),
      Qualifier: '$LATEST'
    }, function(err, data) {
      if (err) {
        app.log.error({err});
        return cb(err);
      }

      let body = data.Payload ? JSON.parse(data.Payload) : undefined;
      delete data.Payload;

      app.log.trace({
        tag_lambda: 'response',
        res: body,
        lambda_data: data
      });

      cb(null, body);
    });
  };
};

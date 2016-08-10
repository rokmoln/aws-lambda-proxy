import _ from 'lodash';
import bodyParser from 'body-parser';
import express from 'express';
import {Lambda} from 'aws-sdk';

let awsLambda = new Lambda({apiVersion: '2015-03-31'});

exports.create = function(options) {
    let app = express();

    app.disable('x-powered-by');
    app.disable('etag');
    app.enable('trust proxy');
    app.use(bodyParser.json());

    app.env = options.env;
    app.log = options.log;
    app.loadLambdas = _.curry(exports.loadLambdas)(app);

    app.use(function(err, _req, res, _next) {
        if (err == null) {
            return res.sendStatus(404);
        }
        options.log.error(err);
        return res.sendStatus(500);
    });

    return app;
};

exports.loadLambdas = function(app, lambdas) {
    let locations = [];
    let arnPrefix = 'arn:aws:lambda:zz-central-1:000000000000:function';

    _.each(lambdas, function({name, pkg, handle}) {
        _.each((pkg.config['aws-lambda'] || {}).locations, function(location) {
            let locationRE = new RegExp(`^${location}$`);
            let functionName = `${process.env.ENV_NAME || 'LOCAL'}-${name}`;
            let ctx = {
                functionName,
                functionVersion: '$LOCAL',
                invokedFunctionArn: `${arnPrefix}:${functionName}:$LOCAL`
            };
            locations.push({
                locationRE,
                ctx,
                handle
            });
        });
    });

    _.each(locations, function({locationRE, ctx, handle}) {
        let router = new express.Router();
        router.all(locationRE, exports.middleware(ctx, handle));
        app.use(router);
    });
};

exports.middleware = function(ctx, handle) {
    return function(req, res, _next) {
        handle({
            method: req.method,
            url: req.originalUrl,
            headers: req.headers,
            body: req.body
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

exports.makeLambdaProxyHandle = function(app, name) {
    return function(e, ctx = {}, cb = _.noop) {
        app.log.trace({
            tag_lambda: 'request',
            req: e
        });

        awsLambda.invoke({
            FunctionName: `${app.env.project.name}-${name}`,
            ClientContext: ctx.clientContext,
            InvocationType: 'RequestResponse',
            LogType: 'None',
            Payload: JSON.stringify(e),
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

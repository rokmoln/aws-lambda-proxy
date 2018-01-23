import _ from 'lodash-firecloud';
import aws from 'aws-sdk';
import url from 'url';

let awsLambda = new aws.Lambda();

export let makeProxyHandler = function({app, lambda: {awsFunctionName}}) {
  return function(e, ctx = {}, cb = _.noop) {
    let basePath = url.parse(e.stageVariables.API_BASE_URL).pathname;
    if (basePath !== '/') {
      e.path = `${basePath}${e.path}`;
    }

    app.log.trace({
      tag_lambda: 'request',
      req: e
    });

    e = _.merge(
      {},
      _.omit(e, ['requestContext']),
      {ctx}
    );

    awsLambda.invoke({
      FunctionName: awsFunctionName,
      ClientContext: undefined,
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

      cb(undefined, body);
    });
  };
};

export default makeProxyHandler;

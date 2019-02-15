import _ from 'lodash-firecloud';
import aws from 'aws-sdk';

let _awsLambda = new aws.Lambda();

export let makeLocalHandler = function({
  lambda: {
    mainFun,
    awsFunctionName
  }
}) {
  return function(e, ctx = {}, cb = _.noop) {
    _awsLambda.getFunctionConfiguration({
      FunctionName: awsFunctionName,
      Qualifier: '$LATEST'
    }, function(err, data) {
      if (err) {
        throw err;
      }

      ctx = _.defaultsDeep({
        env: data.Environment.Variables
      }, ctx);
      mainFun(e, ctx, cb);
    });
  };
};

export default makeLocalHandler;

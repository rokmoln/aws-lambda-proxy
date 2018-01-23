/* eslint-disable import/prefer-default-export */

import _ from 'lodash';
import aws from 'aws-sdk';
import fs from 'fs';
import ini from 'ini';

export let loadAwsCliCredentials = function() {
  try {
    let awsProfile = _.defaultTo(process.env.AWS_PROFILE, process.env.AWS_DEFAULT_PROFILE);
    let configIni = ini.parse(fs.readFileSync(
      `${process.env.HOME}/.aws/config`,
      'utf-8'
    ));
    let awsProfileConfig = configIni[`profile ${awsProfile}`];
    if (awsProfileConfig && awsProfileConfig.role_arn) {
      let roleArn = _.replace(awsProfileConfig.role_arn, /[^A-Za-z0-9\-_:]/g, '-');
      roleArn = _.replace(roleArn, /:/g, '_');
      let awsCliCacheFilename = `${awsProfile}--${roleArn}`;
      let awsCliCache =
          JSON.parse(fs.readFileSync(
            `${process.env.HOME}/.aws/cli/cache/${awsCliCacheFilename}.json`,
            'utf-8'
          ));
      let sts = new aws.STS();
      aws.config.credentials = sts.credentialsFrom(awsCliCache);
    }
  } catch (_err) {
  }
};

export let base64 = function(string) {
  return Buffer.from(string).toString('base64').replace(/=+$/, '');
};

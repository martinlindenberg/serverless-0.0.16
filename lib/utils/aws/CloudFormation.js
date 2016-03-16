'use strict';

/**
 * Serverless Services: AWS: CloudFormation
 * - Prefix custom methods with "s"
 */

let BbPromise = require('bluebird'),
    path      = require('path'),
    os        = require('os'),
    async     = require('async'),
    AWS       = require('aws-sdk'),
    SUtils = require('../../utils'),
    SError = require('../../ServerlessError'),
    fs        = require('fs');

// Promisify fs module. This adds "Async" to the end of every method
BbPromise.promisifyAll(fs);

/**
 * Export
 */

module.exports = function(config) {

  // Promisify and configure instance
  const CloudFormation = BbPromise.promisifyAll(new AWS.CloudFormation(config), { suffix: "Promised" });

  /**
   * Get Lambdas Stack Name
   */

  CloudFormation.sGetLambdasStackName = function(stage, projName) {
    return [projName, stage, 'l'].join('-'); // stack names are alphanumeric + -, no _ :(
  };

  /**
   * Get Resources Stack Name
   */

  CloudFormation.sGetResourcesStackName = function(stage, projName) {
    let name = [projName, stage, 'r'].join('-');
    return name; // stack names are alphanumeric + -, no _
  };

  /**
   * Get Lambda Resource Summaries
   */

  CloudFormation.sGetLambdaResourceSummaries = function(stackName) {

    let moreResources = true,
        nextStackToken,
        lambdas       = [];

    return new BbPromise(function(resolve, reject) {

      // Use whilst in case subsequent calls have to be made to paginate resources
      async.whilst(
          function () {
            return moreResources === true;
          },
          function (callback) {

            let params = {
              StackName: stackName,
              NextToken: nextStackToken ? nextStackToken : null,
            };

            return CloudFormation.listStackResourcesPromised(params)
                .then(function (lambdaCfResources) {

                  if (lambdaCfResources.StackResourceSummaries) {
                    lambdas = lambdas.concat(lambdaCfResources.StackResourceSummaries);
                  }

                  // Check if more resources are available
                  if (!lambdaCfResources.NextToken) {
                    moreResources = false;
                  } else {
                    nextStackToken = lambdaCfResources.NextToken;
                  }

                  return callback();
                })
                .catch(function (error) {

                  if (error.message && error.message.indexOf('does not exist') !== -1) {
                    return reject(new SError(error.message));
                  }

                  moreResources = false;
                  return callback();
                });
          },
          function () {
            return resolve(lambdas);
          }
      );
    });
  };


  CloudFormation.sGetLambdaPhysicalsFromLogicals = function(logicalIds, lambdaResourceSummaries) {
    let lambdaPhysicalIds = [];
    for (let lid of logicalIds) {
      let foundLambda = lambdaResourceSummaries.find(element=> {
        return element.LogicalResourceId == lid;
      });

      if (!foundLambda) {
        throw new SError(`unable to find lambda with logical id ${lid}`, SError.errorCodes.UNKNOWN);
      }

      lambdaPhysicalIds.push(foundLambda.PhysicalResourceId);
    }

    return lambdaPhysicalIds;
  };

  /**
   * Put CF File On S3
   */

  CloudFormation.sPutCfFile = function(projRootPath, bucketName, projName, projStage, type) {

    let S3 = require('./S3')(config);

    if (['lambdas', 'resources'].indexOf(type) == -1) {
      BbPromise.reject(new SError(`Type ${type} invalid. Must be lambdas or resources`, SError.errorCodes.UNKNOWN));
    }

    let d      = new Date(),
        cfPath = path.join(projRootPath, 'cloudformation', type + '-cf.json'),
        key    = ['Serverless', projName, projStage, 'cloudformation/' + type].join('/') + '@' + d.getTime() + '.json',
        params = {
          Bucket:      bucketName,
          Key:         key,
          ACL:         'private',
          ContentType: 'application/json',
          Body:        fs.readFileSync(cfPath),
        };

    return S3.putObjectPromised(params)
      .then(function() {

        // TemplateURL is an https:// URL. You force us to lookup endpt vs bucket/key attrs!?!? wtf not cool
        let s3 = new AWS.S3();
        return 'https://' + s3.endpoint.hostname + `/${bucketName}/${key}`;
      });
  };

  /**
   * Create Lambdas Stack
   */

  CloudFormation.sCreateLambdasStack = function(Serverless, stage, region) {

    let _this        = this,
        projRootPath = Serverless._projectRootPath,
        projName     = Serverless._projectJson.name,
        regionJson   = SUtils.getRegionConfig(
            Serverless._projectJson,
            stage,
            region);

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:    stackName,
      Capabilities: [],
      OnFailure:    'ROLLBACK',
      Parameters:   [{
        ParameterKey:     'LambdaRoleArn',
        ParameterValue:   regionJson.iamRoleArnLambda,
        UsePreviousValue: false,
      },],
      Tags:         [{
        Key:   'STAGE',
        Value: stage,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, regionJson.regionBucket, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.createStackPromised(params);
      });
  };

  /**
   * Update Lambdas Stack
   */

  CloudFormation.sUpdateLambdasStack = function(Serverless, stage, region) {

    let _this        = this,
        projRootPath = Serverless._projectRootPath,
        projName     = Serverless._projectJson.name,
        regionJson   = SUtils.getRegionConfig(Serverless._projectJson, stage, region);

    let stackName = CloudFormation.sGetLambdasStackName(stage, projName);

    let params = {
      StackName:           stackName,
      Capabilities:        [],
      UsePreviousTemplate: false,
      Parameters:          [{
        ParameterKey:      'LambdaRoleArn',
        ParameterValue:    regionJson.iamRoleArnLambda,
        UsePreviousValue:  false,
      },],
    };

    return CloudFormation.sPutCfFile(projRootPath, regionJson.regionBucket, projName, stage, 'lambdas')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.updateStackPromised(params);
      });
  };

  /**
   * Create Resources Stack
   */

  CloudFormation.sCreateResourcesStack = function(
                                            projRootPath,
                                            projName,
                                            projStage,
                                            projDomain,
                                            projNotificationEmail,
                                            templateUrl) {

    let _this = this;
    let stackName = CloudFormation.sGetResourcesStackName(projStage, projName);
    let params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      TemplateURL:  templateUrl,
      OnFailure:    'ROLLBACK',
      Parameters:   [{
        ParameterKey:     'ProjectName',
        ParameterValue:   projName,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'Stage',
        ParameterValue:   projStage,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'DataModelStage',
        ParameterValue:   projStage,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'ProjectDomain',
        ParameterValue:   projDomain,
        UsePreviousValue: false,
      }, {
        ParameterKey:     'NotificationEmail',
        ParameterValue:   projNotificationEmail ? projNotificationEmail : 'me@me.com',
        UsePreviousValue: false,
      }, {
        ParameterKey:     'DynamoRWThroughput',
        ParameterValue:   '1',
        UsePreviousValue: false,
      },],
      Tags:         [{
        Key:   'STAGE',
        Value: projStage,
      },],
    };

    // Create CloudFormation Stack
    return CloudFormation.createStackPromised(params);
  };

  /**
   * Update Resources Stack
   */

  CloudFormation.sUpdateResourcesStack = function(Serverless, stage, region) {

    let _this        = this,
        projRootPath = Serverless._projectRootPath,
        bucketName   = SUtils.getRegionConfig(Serverless._projectJson, stage, region).regionBucket,
        projName     = Serverless._projectJson.name;

    let stackName = CloudFormation.sGetResourcesStackName(stage, projName);

    let params = {
      StackName:           stackName,
      Capabilities:        [
        'CAPABILITY_IAM',
      ],
      UsePreviousTemplate: false,
      Parameters:          [
        {
        ParameterKey:     'ProjectName',
        ParameterValue:   projName,
        UsePreviousValue: false,
        },
        {
        ParameterKey:     'Stage',
        ParameterValue:   stage,
        UsePreviousValue: false,
        },
        {
          ParameterKey:     'DataModelStage',
          ParameterValue:   stage,
          UsePreviousValue: false,
        },
      ],
    };

    return CloudFormation.sPutCfFile(projRootPath, bucketName, projName, stage, 'resources')
      .then(function(templateUrl) {
        params.TemplateURL = templateUrl;
        return CloudFormation.updateStackPromised(params);
      });
  };

  /**
   * Monitor CF Stack Status (Create/Update)
   */

  CloudFormation.sMonitorCf = function(cfData, createOrUpdate, checkFreq) {

    let _this = this,
        stackStatusComplete,
        validStatuses;

    if (!checkFreq) checkFreq = 5000;

    if (createOrUpdate == 'create') {
      stackStatusComplete = 'CREATE_COMPLETE';
      validStatuses       = ['CREATE_IN_PROGRESS', stackStatusComplete];
    } else if (createOrUpdate == 'update') {
      stackStatusComplete = 'UPDATE_COMPLETE';
      validStatuses       = ['UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', stackStatusComplete];
    } else {
      BbPromise.reject(new SError('Must specify create or update', SError.errorCodes.UNKNOWN));
    }

    return new BbPromise(function(resolve, reject) {

      let stackStatus = null,
          stackData   = null;

      async.whilst(
        function() {
          return stackStatus !== stackStatusComplete;
        },

        function(callback) {
          setTimeout(function() {
            let params = {
              StackName: cfData.StackId,
            };
            CloudFormation.describeStacksPromised(params)
              .then(function(data) {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                SUtils.sDebug('CF stack status: ', stackStatus);

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  let prefix = createOrUpdate.slice(0,-1);
                  return reject(new SError(
                    `Something went wrong while ${prefix}ing your cloudformation`));
                } else {
                  return callback();
                }
              });
          }, checkFreq);
        },

        function() {
          return resolve(stackData.Stacks[0]);
        }
      );
    });

  };

  // Return configured, customized instance
  return CloudFormation;
};

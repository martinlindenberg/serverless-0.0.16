![Serverless Application Framework AWS Lambda API Gateway](img/serverless_framework_readme_large.gif)

Serverless Framework V0 (BETA)
=================================

####The Serverless Application Framework Powered By Amazon Web Services - [serverless.com](http://www.serverless.com)

We've re-branded from JAWS and pushed out an entirely refactored product. We're now cleaning up bugs, finishing the new docs and fixing broken features. By the end of this week we will have made rapid progress. Please help us test, submit pull requests, and check out our **[Road Map](https://trello.com/b/EX6SxBJJ/framework)**  for daily status updates.  We will be moving quickly, stay tuned :)

**Note:** This project was formerly JAWS.

## Links
* [Documentation (Under Construction)](http://docs.serverless.com)
* [Gitter](https://gitter.im/serverless/serverless)
* [Road Map](https://trello.com/b/EX6SxBJJ/framework)
* [Twitter](https://twitter.com/goserverless)

## Get Started
This is a command line tool.  It requires Node V4.  Install it via npm:
```
npm install serverless -g
```

## Plugins
Serverless is comprised of Plugins.  A group of default Plugins ship with the Framework, and here are some others you can add to improve/help your workflow:
* **[Plugin Boilerplate](https://github.com/serverless/serverless-plugin-boilerplate)** - Make a Serverless Plugin with this simple boilerplate.
* **[Serve](https://github.com/Nopik/serverless-serve)** - Simulate API Gateway locally, so all function calls can be run via localhost.
* **[Alerting](https://github.com/martinlindenberg/serverless-plugin-alerting)** - This Plugin adds Cloudwatch Alarms with SNS notifications for your Lambda functions.
* **[Optimizer](https://github.com/serverless/serverless-optimizer-plugin)** - Optimizes your code for performance in Lambda.
* **[CORS](https://github.com/joostfarla/serverless-cors-plugin)** - Adds support for CORS (Cross-origin resource sharing).

## Differences From JAWS:

* **Node V4:**  The new Serverless Command Line Tool uses Node V4.  We recommend using [n](https://github.com/tj/n) to seamlessly upgrade your local version of Node.
* **Name & Filename Changes:**  Having JAWS and AWSM was too confusing.  Now, we're just Serverless and Serverless modules.  Your project JSON is now `s-project.json`, your module JSON is now `s-module.json` and your function JSON is now `s-function.json`.
* **New Function JSON Format:**  Our new function JSON format (`s-function.json`) helps reduce boilerplate.  You can still have 1 folder containing 1 Lambda w/ 1 Endpoint.  However, now you can have 1 folder containing 1 Lambda w/ multiple endpoints.  As well as 1 folder containing multiple Lambdas each with multiple endpoints.  You can point your multiple Lambdas to different handlers on a single file, or to different files within the folder.  It's flexible.
* **One Set Of Lambdas Per Region:**  JAWS created a separate CloudFormation stack of Lambdas for each stage + region.  Serverless creates one set of Lambdas for all stages, and replicates them in every region used by your project.
* **AWS-Recommended Workflow:**  Lambda versioning and aliasing support is automatically included.  Every time you deploy a Lambda, it is versioned and aliased to the stage you targeted your deployment to.  This allows large teams to work on one set of Lambdas per region without trampling each other.
* **Removed CloudFormation Support For Project Lambdas:**  We no longer use CloudFormation to deploy your Lambdas.  It is too slow and it is behind on features which we would like to support today.  Our `s-function.json` resembles CF syntax, but is leaner and offers an abstraction layer which we will use to assist your workflow further in the near future.  Lambda Function names are also much neater now.
* **1 REST API Containing Your Project's Stages:**  JAWS created a separate REST API on API Gateway for each of your Project stages.  Now, your project just has one REST API and your Project's Stages are added as stages on that REST API.
* **Stage Variable Support:**  Each stage in your API Gateway REST API uses an API Gateway stage variable to point to Lambdas aliased with the same stage name.  By changing that variable, you can point all endpoints in your REST API Stage to an entirely different set of aliased Lambdas.
* **Plugin Architecture:** Every Action Serverless does is a Plugin.  You can make your own plugins too to add "pre" and "post" hooks on Actions, create custom Actions, or replace an Action entirely.

'use strict';

const SError     = require('./ServerlessError'),
    SUtils       = require('./utils/index'),
    SCli         = require('./utils/cli'),
    awsMisc      = require('./utils/aws/Misc'),
    BbPromise    = require('bluebird');

/**
 * This is the base class that all Serverless Plugins should extend.
 */

class ServerlessPlugin {

  /**
   * Constructor
   */

  constructor(S) {
    this.S = S;
  }

  /**
   * Define your plugins name
   */

  static getName() {
    return 'com.yourdomain.' + ServerlessPlugin.name;
  }

  /**
   * Register Actions
   */

  registerActions() {
    return BbPromise.resolve();
  }

  /**
   * Register Hooks
   */

  registerHooks() {
    return BbPromise.resolve();
  }

  /**
   * CLI: Prompt Input
   * - Handy CLI Prompt Input function for Plugins
   * @param promptSchema @see https://github.com/flatiron/prompt#prompting-with-validation-default-values-and-more-complex-properties
   * @param overrides map {key: 'overrideValue'}
   * @returns {Promise} containing answers by key
   */

  cliPromptInput(promptSchema, overrides) {
    if (this.S._interactive) { //CLI
      let Prompter      = SCli.prompt();
      Prompter.override = overrides;
      return Prompter.getAsync(promptSchema);
    } else {
      return BbPromise.resolve(); //in non interactive mode. All options must be set programatically
    }
  }

  /**
   * CLI: Prompt Select
   * - Handy CLI Select Input function for Plugins
   * @param message string
   * @param choices [{key:"",value:"",label:""}]
   * @param multi boolean
   * @param doneLabel string optional
   * @returns {Promise} containing [{value:'blah'},..]
   */

  cliPromptSelect(message, choices, multi, doneLabel) {
    if (this.S._interactive) { //CLI
      return SCli.select(message, choices, multi, doneLabel);
    } else if (this.S.isWebInterface) {
      //TODO: implement
      return BbPromise.reject(new SError('Not implemented', SError.errorCodes.UNKNOWN));
    } else {
      return BbPromise.reject(new SError('You must specify all necessary options when in a non-interactive mode', SError.errorCodes.UNKNOWN));
    }
  }

  /**
   * CLI: Prompt Select Functions
   * - Prompt the user to select a function in the current working directory
   */

  cliPromptSelectFunctions(cwd, message, multi, skipSingles) {

    let _this = this;

    // If not interactive, throw error
    if (!this.S._interactive) {
      return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
    }

    // Get Functions
    return SUtils.getFunctions(cwd, null)
        .then(function(functions) {

          // If no functions found, return
          if (!functions.length) {
            return [];
          }

          // Skip if only a single option is available
          if (functions.length === 1 && skipSingles) {
            return functions;
          }

          // Prepare function choices
          let choices = [];
          for (let i = 0; i < functions.length; i++) choices.push({
            key:        '  ',
            value:      functions[i],
            label:      'function - ' + functions[i].name
          });

          // Order functions by module
          choices.sort(function(a,b) {
            if (a.value.module.name < b.value.module.name) return -1;
            if (a.value.module.name > b.value.module.name) return 1;
            return 0;
          });

          // Add spacers between modules
          let lastModule;
          for (let i = 0; i < choices.length; i++) {
            if (choices[i].value.module.name !== lastModule) {
              lastModule = choices[i].value.module.name;
              choices.splice(i, 0, { spacer: lastModule });
            }
          }

          // Show select input
          return _this.cliPromptSelect(message, choices, multi, 'Deploy')
              .then(function(selected) {

                let selectedFunctions = [];
                for (let i = 0; i < selected.length; i++) {
                  if (selected[i].toggled) selectedFunctions.push(selected[i].value);
                }

                return selectedFunctions;
              });
        });
  }

  /**
   * CLI: Prompt Select Endpoints
   * - Prompt the user to select an endpoint in the current working directory
   */

  cliPromptSelectEndpoints(cwd, message, multi, skipSingles) {

    let _this = this;

    // If not interactive, throw error
    if (!this.S._interactive) {
      return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
    }

    // Get Endpoints
    return SUtils.getEndpoints(cwd, null)
        .then(function(endpoints) {
          // If no endpoints found, return
          if (!endpoints.length) {
            return [];
          }

          // Skip if only a single option is available
          if (endpoints.length === 1 && skipSingles) {
            return endpoints;
          }

          // Prepare endpoints choices
          let choices = [];
          for (let i = 0; i < endpoints.length; i++) choices.push({
            key:        '  ',
            value:      endpoints[i],
            label:      'endpoint - ' + endpoints[i].path + ' - ' + endpoints[i].method,
          });

          // Order functions by module
          choices.sort(function(a,b) {

            let valueA = a.value.module.name + a.value.module.name;
            let valueB = b.value.module.name + b.value.module.name;

            if (valueA < valueA) return -1;
            if (valueB > valueB) return 1;
            return 0;
          });

          // Add spacers between modules
          let last;
          for (let i = 0; i < choices.length; i++) {

            let current = choices[i].value.module.name + ' - ' + choices[i].value.function.name;

            if (current !== last) {
              last = current;
              choices.splice(i, 0, { spacer: current });
            }
          }

          // Show select input
          return _this.cliPromptSelect(message, choices, multi, 'Deploy')
              .then(function(selected) {

                let selectedEndpoints = [];
                for (let i = 0; i < selected.length; i++) {
                  if (selected[i].toggled) selectedEndpoints.push(selected[i].value);
                }

                return selectedEndpoints;
              });
        });
  }

  /**
   * CLI: Prompt Select Stage
   */

  cliPromptSelectStage(message, stage, addLocalStage) {

    let _this  = this,
        stages = Object.keys(_this.S._projectJson.stages);

    // Resolve stage if provided
    if (stage) return BbPromise.resolve(stage);

    // Skip if not interactive
    if (!_this.S._interactive) return BbPromise.resolve();

    // if project has 1 stage, skip prompt
    if (stages.length === 1) {
      return BbPromise.resolve(stages[0]);
    }

    if (addLocalStage) stages.push('local');

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   (i + 1) + ') ',
        value: stages[i],
        label: stages[i],
      });
    }

    return SCli.select(message, choices, false)
        .then(function(results) {
          return results[0].value;
        });
  }

  /**
   * CLI: Prompt Select Region
   */

  cliPromptSelectRegion(message, addAllRegions, existing, region, stage) {

    let _this = this;

    // Resolve region if provided
    if (region) return BbPromise.resolve(region);

    // Resolve region if local stage
    if (stage === 'local') return BbPromise.resolve('local');

    // If stage has one region, skip prompt and return that instead
    if (stage && _this.S._projectJson.stages[stage].length === 1 && existing) {
      return BbPromise.resolve(_this.S._projectJson.stages[stage][0].region);
    }

    // Skip if not interactive or stage is local
    if (!_this.S._interactive || stage === 'local') return BbPromise.resolve();

    let regionChoices = awsMisc.validLambdaRegions;

    // if stage is provided, limit region list
    if (stage){

      // Make sure stage exists in project
      if (!_this.S._projectJson.stages[stage]) {
        return BbPromise.reject(new SError('Stage ' + stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // if we only want the region that exist in stage
      if (existing) {

        // list only regions in stage
        regionChoices = [];
        _this.S._projectJson.stages[stage].forEach(function(regionInStage){
          regionChoices.push(regionInStage.region)
        });
      } else {
        // make sure there are regions left in stage

        if (_this.S._projectJson.stages[stage].length === 4) {
          return BbPromise.reject(new SError('Stage ' + stage + ' already have all possible regions.', SError.errorCodes.UNKNOWN));
        }
        // list only regions NOT in stage
        _this.S._projectJson.stages[stage].forEach(function(regionInStage){
          let index = regionChoices.indexOf(regionInStage.region);
          regionChoices.splice(index, 1);
        });
      }
    }

    let choices = [];

    if (addAllRegions) {
      choices.push(
          {
            key:   '',
            value: 'all',
            label: 'all',
          }
      );
    }

    regionChoices.forEach(function(r) {
      choices.push({
        key:   '',
        value: r,
        label: r,
      });
    });

    return _this.cliPromptSelect(message, choices, false)
        .then(results => {
          return results[0].value;
        });
  }
}

module.exports = ServerlessPlugin;


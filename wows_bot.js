/*
 * File name: wows_bot.js
 * Description: Contains the functionality to listen for new WowS replay files and check the stats of WoWS players.
 */

let Promise = require('bluebird');
let Bottleneck = require('bottleneck');
let chokidar = require('chokidar');
let request = require('request');

Bottleneck.prototype.Promise = Promise;
let wgApiLimiter = new Bottleneck(10, 1000); // WG API limits us to 10 requests/second for client apps

// contains the entirety of the WoWS bot
// simply require this and pass in the discord.js logged in client
module.exports = function(client) {

  // all vars this module will need
  let module = {};
  let arenaJson = {}; // to be filled later
  let arenaJsonPath = process.env.WOWS_ARENA_JSON + '/tempArenaInfo.json';
  let wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);
  let warshipsTodayApiUrl = '';
  let wargamingApiUrl = '';
  let allStats = [];

  // searches WG API for a player ID by name
  // limited; see requires above
  module.wgSearchPlayerName = function(playerName) {
    return wgApiLimiter.schedule((limitedName) => {
      return new Promise((resolve, reject) => {
        request.get(wargamingApiUrl + 'list/?application_id=' + process.env.WG_API_ID + '&search=' + limitedName, (error, response, body) => {
          let jsonBody = JSON.parse(body);
          if(jsonBody.meta.count > 0) { // exists
            let playerId = jsonBody.data[0].account_id;
            console.log('Player: ' + limitedName + '\n    ID: ' + playerId + '\n');
            resolve(playerId);
          } else { // doesn't exist
            console.log('Could not find ' + limitedName + ' through WG\'s API.');
            resolve(-1); // only rejecting strictly non WG API response errors? TODO: figure out errors on all calls
          }
        });
      });
    }, playerName);
  };

  // pass through wrapper needed to maintain variables within for loop
  function wgSearchPlayerNameWrapper(playerInfo) {
    return new Promise((resolve, reject) => {
      module.wgSearchPlayerName(playerInfo.name)
        .then(playerId => {
          resolve([playerInfo, playerId]);
        })
        .catch(rejectReason => {
          reject([playerInfo, rejectReason]);
        });
    });
  };

  // fetches warships.today data for passed in player ID
  module.warships_today = function(playerId) {
    return new Promise((resolve, reject) => {
      // grab stats from warships.today
      request.get(warshipsTodayApiUrl + 'player/' + playerId + '/current', (error, response, body) => {
        resolve(JSON.parse(body));
      })
    });
  };

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch() {
    let hrStart = process.hrtime();

    wowsChannel.send('Detected a match! Loading player stats...');

    // parse json and build team arrays
    arenaJson = require(arenaJsonPath); // blocking operation, but we need to wait anyways
    let playerAmount = arenaJson.vehicles.length;
    for(let vehicleIndex in arenaJson.vehicles) {
      let player = arenaJson.vehicles[vehicleIndex];

      // get ID by name
      wgSearchPlayerNameWrapper(player)
        .then((searchResult) => {
          let playerInfo = searchResult[0];
          let playerId = searchResult[1];

          // get warships.today stats
          module.warships_today(playerId)
            .then((stats) => {
              allStats.push([playerInfo, playerId, stats]);

              // wait until all stats are retrieved
              if(allStats.length == playerAmount) {
                console.log('Finished grabbing all stats!');
                let hrEnd = process.hrtime(hrStart);
                console.log('It took ' + hrEnd[0] + '.' + hrEnd[1] + ' seconds to retrieve all warships.today info.');
              }
            });
        });
    }
  };

  // inits the API URLs depending on set region
  function initApiUrl() {
    switch(process.env.WOWS_REGION) {
      case 'na':
        warshipsTodayApiUrl = 'https://api.na.warships.today/api/';
        wargamingApiUrl = 'https://api.worldoftanks.com/wgn/account/';
        break;
      case 'eu':
        warshipsTodayApiUrl = 'https://api.eu.warships.today/api/';
        wargamingApiUrl = 'https://api.worldoftanks.eu/wgn/account/';
        break;
      case 'ru':
        warshipsTodayApiUrl = 'https://api.eu.warships.today/api/';
        wargamingApiUrl = 'https://api.worldoftanks.ru/wgn/account/';
        break;
      case 'asia':
        warshipsTodayApiUrl = 'https://api.asia.warships.today/api/';
        wargamingApiUrl = 'https://api.worldoftanks.asia/wgn/account/';
        break;
      default:
        throw new Error('Invalid WOWS_REGION set! It should be "na", "eu", "ru", or "asia", without quotes.');
        break;
    }
  };
  initApiUrl();

  // watch for tempArenaInfo.json with player info created by wows
  let watcher = chokidar.watch(arenaJsonPath, {
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });
  watcher.on('add', (path) => processMatch());
}

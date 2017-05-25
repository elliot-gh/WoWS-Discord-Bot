/*
 * File name: wows_bot.js
 * Description: Contains the functionality to listen for new WowS replay files and check the stats of WoWS players.
 */

var Promise = require('promise');
var request = require('request');
var chokidar = require('chokidar');
var Bottleneck = require('bottleneck');
var wgApiLimiter = new Bottleneck(10, 1000); // WG API limits us to 10 requests/second for client apps

// contains the entirety of the WoWS bot
// simply require this and pass in the discord.js logged in client
module.exports = function(client) {

  // all vars this module will need
  var module = {};
  var arenaJson = {}; // to be filled later
  const arenaJsonPath = process.env.WOWS_ARENA_JSON + '/tempArenaInfo.json';
  const wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);
  var warshipsTodayApiUrl = '';
  var wargamingApiUrl = '';
  var friendlyTeam = [];
  var enemyTeam = [];
  var tmpMsg = []; // TODO: remove

  // searches WG API for a player ID by name
  // limited; see requires above
  module.wgSearchPlayerName = function(playerName) {
    return wgApiLimiter.schedule(function limitedSearch(limitedName) {
      return new Promise(function(resolve, reject) {
        request.get(wargamingApiUrl + 'list/?application_id=' + process.env.WG_API_ID + '&search=' + limitedName, function(error, response, body) {
          var jsonBody = JSON.parse(body);
          if(jsonBody.meta.count > 0) { // exists
            var playerId = jsonBody.data[0].account_id;
            console.log('Player: ' + limitedName + ', ID: ' + playerId);
            tmpMsg.push('Player: ' + limitedName + ', ID: ' + playerId); // TODO: remove
            resolve(playerId);
          } else { // doesn't exist
            console.log('Could not find ' + limitedName + ' through WG\'s API.');
            resolve(-1); // only rejecting strictly non WG API response errors
          }
        });
      });
    }, playerName);
  };

  // fetches warships.today data for passed in player ID
  module.warships_today = function(playerId) {
    return new Promise(function(resolve, reject) {
      // grab stats from warships.today
      request.get(warshipsTodayApiUrl + 'player/' + playerId + '/current', function(error, response, body) {
        console.log('Got warships.today info!');
        resolve(body);
      })
    });
  };

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows 
  function processMatch() {
    var hrStart = process.hrtime();

    //wowsChannel.send('Detected a match! Loading player stats...');

    // parse json and build team arrays
    var statPromises = [];
    arenaJson = require(arenaJsonPath); // blocking operation, but we need to wait anyways
    for(var vehicleIndex in arenaJson.vehicles) {
      var player = arenaJson.vehicles[vehicleIndex];

      module.wgSearchPlayerName(player.name)
        .then(function(playerId) {
          statPromises.push(module.warships_today(playerId));
        })
        .catch(function(rejectReason) {
          //
        });

      // TODO: move
      if(player.relation == 0 || player.relation == 1) { // self or friendly
        friendlyTeam.push(player);
      } else if(player.relation == 2) { // enemy
        enemyTeam.push(player);
      }
    }

    Promise.all(statPromises).then(function(stats) {
      console.log(statPromises.length);
      var newMsg = '';
      for(var msg in tmpMsg) {
        newMsg += (msg + '\n');
      }
      //wowsChannel.send(newMsg);
      console.log(newMsg);
      var hrEnd = process.hrtime(hrStart);
      //wowsChannel.send('It took ' + hrEnd[1]/1000000000 + ' seconds to retrieve all warships.today info.');
      console.log('It took ' + hrEnd[1]/1000000000 + ' seconds to retrieve all warships.today info.');
    }).catch(function(rejectReason) {
      //
    });    
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
  var watcher = chokidar.watch(arenaJsonPath, {
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });
  watcher.on('add', path => processMatch());
}

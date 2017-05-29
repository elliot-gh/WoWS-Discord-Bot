/*
 * File name: wows_bot.js
 * Description: Contains the functionality to listen for new WowS replay files and check the stats of WoWS players.
 */

let Promise = require('bluebird');
let Bottleneck = require('bottleneck');
let chokidar = require('chokidar');
let request = require('request');

Bottleneck.prototype.Promise = Promise;
let wgApiLimiter = new Bottleneck(1, 100); // WG API limits us to 10 requests/second for client apps

// contains the entirety of the WoWS bot
// simply require this and pass in the discord.js logged in client
module.exports = function(client) {

  // all vars this module will need
  let module = {};
  let arenaJson = {}; // to be filled later
  let allMsg = [];
  let arenaJsonPath = process.env.WOWS_ARENA_JSON + '/tempArenaInfo.json';
  let wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);
  let warshipsTodayApiUrl = '';
  let wargamingApiUrl = '';
  let wargamingApiId = '?application_id=' + process.env.WG_API_ID;

  // searches WG API for a player ID by name
  // limited; see requires above
  module.wgSearchPlayerName = function(playerName) {
    return wgApiLimiter.schedule((playerName) => {
      return new Promise((resolve, reject) => {
        if(playerName === undefined) {
          reject('Player ID is empty!');
        }

        // define api params
        let accountApi = 'account/list/';
        let searchParam = '&search=' + playerName;

        request.get(
            wargamingApiUrl + accountApi + wargamingApiId + searchParam, 
            (error, response, body) => {
          let jsonBody = JSON.parse(body);
          if(jsonBody.meta.count > 0) { // exists
            let playerId = jsonBody.data[0].account_id;
            console.log('Player: ' + playerName + '\n    ID: ' + playerId);
            resolve(playerId);
          } else { // doesn't exist
            console.log('Could not find ' + playerName + ' through WG\'s API.');
            resolve(-1); // only rejecting strictly non WG API response errors? TODO: figure out errors on all calls
          }
        });
      });
    }, playerName);
  };

  // searches WG API for ship type/name by ID
  // limited; see requires above 
  module.wgSearchShipName = function(shipId) {
    return wgApiLimiter.schedule((shipId) => {
      return new Promise((resolve, reject) => {
        // define api params
        let encyclopediaApi = 'encyclopedia/ships/';
        let searchParam = '&ship_id=' + shipId;
        let fieldsParam = '&fields=name';

        request.get(
            wargamingApiUrl + encyclopediaApi + wargamingApiId + searchParam + fieldsParam,
            (error, response, body) => {
          let jsonBody = JSON.parse(body);
          console.log('Got ship info for ' + shipId + '!');
          resolve(jsonBody.data[shipId].name);
        });
      });
    }, shipId);
  };

  // queries WG API for WoWS player stats
  // limited; see requires above
  // TODO: customize options 
  module.wgStats = function(playerId, shipId) {
    return wgApiLimiter.schedule((playerId, shipId) => {
      return new Promise((resolve, reject) => {
        if(playerId === undefined) {
          reject('Player ID is empty!');
        } else if(shipId === undefined) {
          reject('Ship ID is empty!');
        }

        // define api params
        let shipStatsApi = 'ships/stats/';
        let accountParam = '&account_id=' + playerId;
        let shipParam = '&ship_id=' + shipId;
        let fieldsParam = '&fields=pvp.battles, pvp.wins, pvp.damage_dealt, pvp.xp, pvp.survived_battles, pvp.frags, pvp.planes_killed';

        request.get(
            wargamingApiUrl + shipStatsApi + wargamingApiId + accountParam + shipParam + fieldsParam, 
            (error, response, body) => {
          // get response data
          let jsonBody = JSON.parse(body);
          if(jsonBody.meta.hidden !== null) { // hidden stats
            console.log('Got player stats for ' + playerId + '!');
            resolve('Profile hidden.');
            return;
          } else if(jsonBody.data === null) { // first battle
            console.log('Got player stats for ' + playerId + '!');
            resolve('First game.');
            return;
          }

          let dataArray = jsonBody.data[playerId];
          let pvpStats = dataArray[0].pvp;
          
          // calculate needed data
          let kdTmp; // check for divide by 0
          if(pvpStats.battles - pvpStats.survived_battles == 0) {
            kdTmp = 'inf';
          } else {
            kdTmp = pvpStats.frags / (pvpStats.battles - pvpStats.survived_battles);
          }

          let stats = {
            totalBattles: pvpStats.battles,
            winRate: (pvpStats.wins / pvpStats.battles) * 100,
            avgDmg: pvpStats.damage_dealt / pvpStats.battles,
            avgXp: pvpStats.xp / pvpStats.battles,
            survivalRate: (pvpStats.survived_battles / pvpStats.battles) * 100,
            avgKills: pvpStats.frags / pvpStats.battles,
            avgPlaneKills: pvpStats.planes_killed / pvpStats.battles,
            kd: kdTmp
          };

          console.log('Got player stats for ' + playerId + '!');
          resolve(stats);
        });
      });
    }, playerId, shipId);
  };

  // format stats into something readable
  module.formatStats = function(stats, playerName, shipName) {
    if(typeof stats === 'string') { // hidden or some kind of error
      return '**' + playerName + '**: *' + shipName + '*\n' + stats;
    } else { // JSON
      let msg = '**' + playerName + '**: *' + shipName + '*\n' +
                'Battles: ' + stats.totalBattles + '\n' +
                'Win Rate: ' + stats.winRate.toFixed(2) + '%\n' +
                'Average Damage: ' + stats.avgDmg.toFixed(0) + '\n' +
                'Average XP: ' + stats.avgXp.toFixed(0) + '\n' +
                'Survival Rate: ' + stats.survivalRate.toFixed(2) + '%\n' +
                'Average Kills: ' + stats.avgKills.toFixed(2) + '\n' +
                'Average Plane Kills: ' + stats.avgPlaneKills.toFixed(2) + '\n' +
                'KD: ' + stats.kd.toFixed(2) + '\n';
      return msg;
    }
  }

  // pass through wrapper needed to maintain variables within for loop
  function wgSearchPlayerNameWrapper(playerInfo) {
    return new Promise((resolve, reject) => {
      module.wgSearchPlayerName(playerInfo.name)
        .then((playerId) => {
          resolve([playerInfo, playerId]);
        })
        .catch((rejectReason) => {
          reject([playerInfo, rejectReason]);
        });
    });
  };

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(path) {
    let hrStart = process.hrtime();

    console.log('Loading file ' + path + '...');
    wowsChannel.send('Detected a match! Loading player stats...');

    // parse json and build team arrays
    arenaJson = require(arenaJsonPath); // blocking operation, but we need to wait anyways
    allMsg = [];
    let playerAmount = arenaJson.vehicles.length;
    for(let vehicleIndex in arenaJson.vehicles) {
      let player = arenaJson.vehicles[vehicleIndex];

      // get ID by name
      wgSearchPlayerNameWrapper(player)
        .then((searchResult) => {
          let playerInfo = searchResult[0];
          let playerId = searchResult[1];

          module.wgStats(playerId, playerInfo.shipId)
            .then((stats) => {

              module.wgSearchShipName(playerInfo.shipId)
                .then((shipName) => {
                  let msg = module.formatStats(stats, playerInfo.name, shipName);
                  allMsg.push(msg);

                  if(allMsg.length == playerAmount) {
                    allMsg.sort();
                    for(let msgIndex in allMsg) {
                      wowsChannel.send(allMsg[msgIndex]);
                    }
                  }
              });
          });
        });
    }
  };

  // inits the API URLs depending on set region
  function initApiUrl() {
    switch(process.env.WOWS_REGION) {
      case 'na':
        warshipsTodayApiUrl = 'https://api.na.warships.today/api/';
        wargamingApiUrl = 'https://api.worldofwarships.com/wows/';
        break;
      case 'eu':
        warshipsTodayApiUrl = 'https://api.eu.warships.today/api/';
        wargamingApiUrl = 'https://api.worldofwarships.eu/wows/account/';
        break;
      case 'ru':
        warshipsTodayApiUrl = 'https://api.eu.warships.today/api/';
        wargamingApiUrl = 'https://api.worldofwarships.ru/wows/';
        break;
      case 'asia':
        warshipsTodayApiUrl = 'https://api.asia.warships.today/api/';
        wargamingApiUrl = 'https://api.worldofwarships.asia/wows/';
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
  watcher.on('add', (path) => processMatch(path));
}

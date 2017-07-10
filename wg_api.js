/*
 * File name: wg_api.js
 * Description: Contains functions to interact with the Wargaming API.
 */

let Promise = require('bluebird');
let Bottleneck = require('bottleneck');
let request = require('request');
let utilsStats = require('./utils_stats.js')();

// contains the WG API functions
// just require() this
module.exports = function() {
  let module = {}; // the module
  let wgApiLimiter; // bottleneck for WG API requests
  let wargamingApiUrl; // region specific API URL for wargaming
  let wargamingApiId; // paramter with wargaming API application ID

  // common/error strings
  const ERROR_WG_MAX_REQUESTS_NOT_SET = 'WG_MAX_REQUESTS not set!';
  const ERROR_WOWS_REGION_NOT_SET = 'Invalid WOWS_REGION or not set! It should be "na", "eu", "ru", or "asia", without quotes.';
  const ERROR_WG_API_ID_NOT_SET = 'WG_API_ID was not set!';
  const ERROR_WG_API_CONNECTION = 'ERROR: Error while contacting the Wargaming API: ';
  const ERROR_WG_API_RETURN = 'ERROR: Wargaming API returned the following error: ';
  const ERROR_PLAYER_NAME_EMPTY = 'Player name is empty!';
  const ERROR_PLAYER_ID_EMPTY = 'Player ID is empty!';
  const ERROR_SHIP_ID_EMPTY = 'Ship ID is empty!';
  const ERROR_SHIP_NAME_EMPTY = 'Ship name is empty!';
  const ERROR_NOT_FOUND = ' was not found. Check your spelling and try again.';
  const WARN_NO_EXACT_MATCH_SHIP = 'An exact ship name match was not found; showing the closest result.';

  // searches WG API for a player ID by name
  // limited amount of requests/second
  module.searchPlayerId = function(playerName) {
    return wgApiLimiter.schedule((playerName) => {
      return new Promise((resolve, reject) => {
        if(playerName === undefined) {
          reject(ERROR_PLAYER_NAME_EMPTY);
          return;
        }

        // define API params
        let accountApi = 'account/list/';
        let searchParam = '&search=' + playerName;

        request.get( // search for a player name
            wargamingApiUrl + accountApi + wargamingApiId + searchParam, 
            (error, response, body) => {
          if(error) {
            console.log(ERROR_WG_API_CONNECTION + error);
            reject(ERROR_WG_API_CONNECTION + error);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            console.log(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            reject(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            return;
          }

          if(jsonBody.meta.count > 0) { // exists
            let playerId = jsonBody.data[0].account_id;
            console.log('Player: ' + playerName + '\n    ID: ' + playerId);
            resolve(playerId);
            return;
          } else { // no players found
            console.log(playerName + ERROR_NOT_FOUND);
            reject(playerName + ERROR_NOT_FOUND);
            return;
          }
        });
      });
    }, playerName);
  };

  // searches WG API for ship ID by name
  // limited amount of requests/second 
  module.searchShipId = function(shipName) {
    return wgApiLimiter.schedule((shipName) => {
      return new Promise((resolve, reject) => {
        if(shipName === undefined) {
          reject(ERROR_SHIP_NAME_EMPTY);
          return;
        }

        // define API params
        let encyclopediaApi = 'encyclopedia/ships/';
        let fieldsParam = '&fields=name';

        request.get( // retrieve a list of all ships
            wargamingApiUrl + encyclopediaApi + wargamingApiId + fieldsParam,
            (error, response, body) => {
          if(error) {
            console.log(ERROR_WG_API_CONNECTION + error);
            reject(ERROR_WG_API_CONNECTION + error);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            console.log(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            reject(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            return;
          }

          let topResult = {};
          let topResultDist = -1;
          let jsonData = jsonBody.data;
          for(let dataKey in jsonData) { // iterate through everey ship
            if(!jsonData.hasOwnProperty(dataKey)) {
              continue;
            }

            let actualShipName = jsonData[dataKey].name;
            if(shipName === actualShipName) { // identical names
              console.log(actualShipName + ' is ' + dataKey + '.');
              resolve({
                'name': actualShipName,
                'id': dataKey,
                'message': ''
              });
              return;
            } 

            // use the lowest Levenshtein Distance
            let levDist = utilsStats.levenshteinDistance(shipName, actualShipName);
            if(topResultDist === -1 || levDist <= topResultDist) {
              topResultDist = levDist;
              topResult =  {
                'name': actualShipName,
                'id': dataKey
              };
            }
          }

          if(topResultDist !== -1) {
            console.log(topResult.name + ' is ' + topResult.id + '.');
            resolve({
              'name': topResult.name,
              'id': topResult.id,
              'message': WARN_NO_EXACT_MATCH_SHIP
            });
            return;
          }

          // this is now probably never going to be reached
          console.log(shipName + ERROR_NOT_FOUND);
          reject(shipName + ERROR_NOT_FOUND);
          return;
        });
      });
    }, shipName);
  };

  // searches WG API for ship name by ID
  // limited amount of requests/second
  module.searchShipName = function(shipId) {
    return wgApiLimiter.schedule((shipId) => {
      return new Promise((resolve, reject) => {
        if(shipId === undefined) {
          reject(ERROR_SHIP_ID_EMPTY);
        }

        // define API params
        let encyclopediaApi = 'encyclopedia/ships/';
        let searchParam = '&ship_id=' + shipId;
        let fieldsParam = '&fields=name';

        request.get(
            wargamingApiUrl + encyclopediaApi + wargamingApiId + searchParam + fieldsParam,
            (error, response, body) => {
          if(error) {
            console.log(ERROR_WG_API_CONNECTION + error);
            reject(ERROR_WG_API_CONNECTION + error);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            console.log(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            reject(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            return;
          }

          let shipName = jsonBody.data[shipId].name;
          if(shipName !== null) {
            console.log(shipId + ' is ' + shipName + '.');
            resolve(shipName);
            return;
          } else {
            console.log(shipId + ERROR_NOT_FOUND);
            reject(shipId + ERROR_NOT_FOUND);
            return;
          }          
        });
      });
    }, shipId);
  };

  // queries WG API for WoWS player stats
  // limited amount of requests/second
  module.stats = function(playerId, shipId) {
    return wgApiLimiter.schedule((playerId, shipId) => {
      return new Promise((resolve, reject) => {
        if(playerId === undefined) {
          reject(ERROR_PLAYER_ID_EMPTY);
        } else if(playerId === undefined) {
          reject('Ship ID is empty!');
        }

        // define API params
        let shipStatsApi = 'ships/stats/';
        let accountParam = '&account_id=' + playerId;
        let fieldsParam = '&fields=pvp.battles, pvp.wins, pvp.damage_dealt, ' +
            'pvp.xp, pvp.survived_battles, pvp.frags, pvp.planes_killed';
        let shipParam = '';
        if(shipId !== undefined) {
          shipParam = '&ship_id=' + shipId;
        }

        request.get( // grab specific player stats
            wargamingApiUrl + shipStatsApi + wargamingApiId + accountParam + shipParam + fieldsParam, 
            (error, response, body) => {
          if(error) {
            console.log(ERROR_WG_API_CONNECTION + error);
            reject(ERROR_WG_API_CONNECTION + error);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            console.log(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            reject(ERROR_WG_API_RETURN + jsonBody.error.code + ' ' + jsonBody.error.message);
            return;
          }

          console.log('Got player stats for ' + playerId + '!');

          if(jsonBody.meta.hidden !== null) { // hidden stats
            resolve('Profile hidden.\n');
            return;
          } else if(jsonBody.data[playerId] === null) { // first battle ever
            resolve('First game, or this player does not own this ship.\n');
            return;
          }

          let dataArray = jsonBody.data[playerId];
          let pvpStats = dataArray[0].pvp;

          if(pvpStats.battles === 0) {
            resolve('First game in PvP, but has played this ship in PvE before.\n');
            return;
          }
          
          // calculate needed data
          let kdTmp; // check for divide by 0
          if(pvpStats.battles - pvpStats.survived_battles === 0) {
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

          resolve(stats);
          return;
        });
      });
    }, playerId, shipId);
  };

  // init bot
  function initWgApis() {
    // make sure WG API requests/second limit was set
    if(process.env.WG_MAX_REQUESTS === undefined || process.env.WG_MAX_REQUESTS === '') {
      throw new Error(ERROR_WG_MAX_REQUESTS_NOT_SET);
    }
    wgApiLimiter = new Bottleneck(1, 1000 / parseInt(process.env.WG_MAX_REQUESTS, 10));

    // init API URLs
    switch(process.env.WOWS_REGION) {
      case 'na':
        wargamingApiUrl = 'https://api.worldofwarships.com/wows/';
        break;
      case 'eu':
        wargamingApiUrl = 'https://api.worldofwarships.eu/wows/';
        break;
      case 'ru':
        wargamingApiUrl = 'https://api.worldofwarships.ru/wows/';
        break;
      case 'asia':
        wargamingApiUrl = 'https://api.worldofwarships.asia/wows/';
        break;
      default:
        throw new Error(ERROR_WOWS_REGION_NOT_SET);
    }

    if(process.env.WG_API_ID === undefined || process.env.WG_API_ID === '') {
      throw new Error(ERROR_WG_API_ID_NOT_SET);
    }
    wargamingApiId = '?application_id=' + process.env.WG_API_ID;
  }
  initWgApis();

  return module;
};

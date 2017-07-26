/*
 * File name: wg_api.js
 * Description: Contains functions to interact with the Wargaming API.
 */

const Promise = require('bluebird');
const Bottleneck = require('bottleneck');
const request = require('request');
const util = require('util');
const utilsStats = require('./utils_stats.js')();

// contains the Wargaming API functions
// just require() this
module.exports = function() {
  let module = {}; // this module
  let wgApiLimiter; // bottleneck for Wargaming API requests
  let wargamingApiUrl; // region specific API URL for Wargaming
  let wargamingApiId; // paramter with Wargaming API application ID

  // program strings
  const STR_REGION_ASIA = 'asia';
  const STR_REGION_EU = 'eu';
  const STR_REGION_NA = 'na';
  const STR_REGION_RU = 'ru';
  /*
    where are the API URLs and parameters?
    unfortunately since they can be unique and changes to the API may warrant
    looking over how all the functions work individually, 
    I will not be defining them up here.
   */

  // message strings
  const MSG_PROFILE_HIDDEN = 'Profile hidden.\n';
  const MSG_NO_STATS = 'First game, or this player does not own this ship.\n';
  const MSG_FIRST_PVP = 'First game in PvP, but has played this ship in PvE before.\n';

  // console strings
  const CON_GOT_STATS = 'Got player stats for %d!'; // player ID
  const CON_ID_TO_SHIP = '%d is %s.'; // ship ID, ship name
  const CON_PLAY_TO_ID = 'Player: %s\n' + // player name
                         '    ID: %d'; // player ID
  const CON_SHIP_TO_ID = '%s is %d.'; // ship name, ship ID

  // error strings
  const ERR_NOT_FOUND_NAME = '%s was not found. Check your spelling and try again.'; // whatever name is not found
  const ERR_NOT_FOUND_ID = '%d was not found. Check the ID and try again.'; // whatever ID is not found
  const ERR_PLAYER_ID_EMPTY = 'Player ID is empty!';
  const ERR_PLAYER_NAME_EMPTY = 'Player name is empty!';
  const ERR_PLAYER_NAME_MULTIPLE_EMPTY = 'Player names are empty!';
  const ERR_SHIP_ID_EMPTY = 'Ship ID is empty!';
  const ERR_SHIP_NAME_EMPTY = 'Ship name is empty!';
  const ERR_WG_API_CONNECTION = 'ERROR: Error while contacting the Wargaming API: %s'; // the error
  const ERR_WG_API_ID_NOT_SET = 'WG_API_ID was not set!';
  const ERR_WG_API_RETURN = 'ERROR: Wargaming API returned the following error: %s %s'; // error code + error msg
  const ERR_WG_MAX_REQUESTS_NOT_SET = 'WG_MAX_REQUESTS not set!';
  const ERR_WOWS_REGION_NOT_SET = 'Invalid WOWS_REGION or not set! It should be "na", "eu", "ru", or "asia", without quotes.';
  const WARN_NO_EXACT_MATCH_SHIP = 'An exact ship name match was not found; showing the closest result.';

  // takes in an array of player objects that at least consist of {name, id}
  // limited amount of requests/second
  module.searchMultiplePlayerIds = function(multPlayerNames) {
    return wgApiLimiter.schedule((multPlayerNames) => {
      return new Promise((resolve, reject) => {
        if(multPlayerNames === undefined || multPlayerNames.length === 0) {
          reject(ERR_PLAYER_NAME_MULTIPLE_EMPTY);
          return;
        }

        // define API params
        const accountApi = 'account/list/';
        const typeParam = '&type=exact';
        let searchParam = '&search=';

        for(let nameIndex = 0; nameIndex < multPlayerNames.length; nameIndex++) {
          if(!multPlayerNames.hasOwnProperty(nameIndex)) {
            continue;
          }

          searchParam += multPlayerNames[nameIndex].name;
          if(nameIndex !== multPlayerNames.length - 1) {
            searchParam += ',';
          }
        }

        request.get(
            wargamingApiUrl + accountApi + wargamingApiId + searchParam + typeParam,
            (error, response, body) => {
          if(error) {
            let errStr = util.format(ERR_WG_API_CONNECTION, error);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            let errStr = util.format(ERR_WG_API_RETURN, jsonBody.error.code, jsonBody.error.message);
            console.log(errStr);
            reject(errStr);
            return;
          }

          // returns an array of objects with {nickname, account_id}
          let wgSearchResults = jsonBody.data;

          // begin sort and searching intersection
          multPlayerNames.sort((obj1, obj2) => {
            if(obj1.name < obj2.name) {
              return -1;
            } else if(obj1.name > obj2.name) {
              return 1;
            } else {
              return 0;
            }
          });
          wgSearchResults.sort((obj1, obj2) => {
            if(obj1.nickname < obj2.nickname) {
              return -1;
            } else if(obj1.nickname > obj2.nickname) {
              return 1;
            } else {
              return 0;
            }
          });

          let multIndex = 0;
          let wgIndex = 0;
          let matching = [];
          let missing = [];

          // iterate through each array, getting matching names
          while(multIndex < multPlayerNames.length && wgIndex < wgSearchResults.length) {
            if(multPlayerNames[multIndex].name < wgSearchResults[wgIndex].nickname) {
              let missingPlayer = {
                reason: util.format(ERR_NOT_FOUND_NAME, multPlayerNames[multIndex].name),
                relation: multPlayerNames[multIndex].relation
              };
              missing.push(missingPlayer);
              multIndex++;
            } else if(multPlayerNames[multIndex].name > wgSearchResults[wgIndex].nickname) {
              let missingPlayer = {
                reason: util.format(ERR_NOT_FOUND_NAME, wgSearchResults[wgIndex].nickname),
                relation: -1 // we don't know the relation, so leave it at -1
              };
              missing.push(missingPlayer);
              wgIndex++;
            } else { // match found
              let vehicleMatch = multPlayerNames[multIndex];
              vehicleMatch.playerId = wgSearchResults[wgIndex].account_id;
              matching.push(vehicleMatch);

              multIndex++;
              wgIndex++;
            }
          }

          resolve({
            matching: matching,
            missing: missing
          });
          return;
        });
      });
    }, multPlayerNames);
  };

  // searches WG API for a player ID by name
  // limited amount of requests/second
  module.searchPlayerId = function(playerName) {
    return wgApiLimiter.schedule((playerName) => {
      return new Promise((resolve, reject) => {
        if(playerName === undefined) {
          reject(ERR_PLAYER_NAME_EMPTY);
          return;
        }

        // define API params
        const accountApi = 'account/list/';
        const searchParam = '&search=' + playerName;

        request.get( // search for a player name
            wargamingApiUrl + accountApi + wargamingApiId + searchParam, 
            (error, response, body) => {
          if(error) {
            let errStr = util.format(ERR_WG_API_CONNECTION, error);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            let errStr = util.format(ERR_WG_API_RETURN, jsonBody.error.code, jsonBody.error.message);
            console.log(errStr);
            reject(errStr);
            return;
          }

          if(jsonBody.meta.count > 0) { // exists
            let playerId = jsonBody.data[0].account_id;
            console.log(util.format(CON_PLAY_TO_ID, playerName, playerId));
            resolve(playerId);
            return;
          } else { // no players found
            let errStr = util.format(ERR_NOT_FOUND_NAME, playerName);
            console.log(errStr);
            reject(errStr);
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
          reject(ERR_SHIP_NAME_EMPTY);
          return;
        }

        // define API params
        const encyclopediaApi = 'encyclopedia/ships/';
        const fieldsParam = '&fields=name';

        request.get( // retrieve a list of all ships
            wargamingApiUrl + encyclopediaApi + wargamingApiId + fieldsParam,
            (error, response, body) => {
          if(error) {
            let errStr = util.format(ERR_WG_API_CONNECTION, error);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            let errStr = util.format(ERR_WG_API_RETURN, jsonBody.error.code, jsonBody.error.message);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let topResult = {}; // JSON data of the best matching name
          let topResultDist = -1; // the Levenshtein distance of best matching name
          let jsonData = jsonBody.data;
          for(let shipIdKey in jsonData) { // iterate through everey ship, unfortunately.
            if(!jsonData.hasOwnProperty(shipIdKey)) {
              continue;
            }

            let actualShipName = jsonData[shipIdKey].name;
            if(shipName === actualShipName) { // identical names
              console.log(util.format(CON_SHIP_TO_ID, actualShipName, shipIdKey));
              resolve({
                'name': actualShipName,
                'id': shipIdKey,
                'message': ''
              });
              return;
            } else { // use the lowest Levenshtein distance
              let levDist = utilsStats.levenshteinDistance(shipName, actualShipName);
              if(topResultDist === -1 || levDist <= topResultDist) {
                topResultDist = levDist;
                topResult =  {
                  'name': actualShipName,
                  'id': shipIdKey
                };
              }
            }
          }

          // as long as something was found, use it
          if(topResultDist !== -1) {
            console.log(util.format(CON_SHIP_TO_ID, topResult.name, topResult.id));
            resolve({
              'name': topResult.name,
              'id': topResult.id,
              'message': WARN_NO_EXACT_MATCH_SHIP
            });
            return;
          }

          // should never be reached... but you never know
          let errStr = util.format(ERR_NOT_FOUND_NAME, shipName);
          console.log(errStr);
          reject(errStr);
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
          reject(ERR_SHIP_ID_EMPTY);
        }

        // define API params
        let encyclopediaApi = 'encyclopedia/ships/';
        let searchParam = '&ship_id=' + shipId;
        let fieldsParam = '&fields=name';

        request.get( // search ship by ID, and get only name field
            wargamingApiUrl + encyclopediaApi + wargamingApiId + searchParam + fieldsParam,
            (error, response, body) => {
          if(error) {
            let errStr = util.format(ERR_WG_API_CONNECTION, error);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            let errStr = util.format(ERR_WG_API_RETURN, jsonBody.error.code, jsonBody.error.message);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let shipName = jsonBody.data[shipId].name;
          if(shipName !== null) { // we got a name
            console.log(util.format(CON_ID_TO_SHIP, shipId, shipName));
            resolve(shipName);
            return;
          } else { // nothing found
            let errStr = util.format(ERR_NOT_FOUND_ID, shipId);
            console.log(errStr);
            reject(errStr);
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
          reject(ERR_PLAYER_ID_EMPTY);
        } else if(playerId === undefined) {
          reject(ERR_SHIP_ID_EMPTY);
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
            let errStr = util.format(ERR_WG_API_CONNECTION, error);
            console.log(errStr);
            reject(errStr);
            return;
          }

          let jsonBody = JSON.parse(body);
          if(jsonBody.status === 'error') {
            let errStr = util.format(ERR_WG_API_RETURN, jsonBody.error.code, jsonBody.error.message);
            console.log(errStr);
            reject(errStr);
            return;
          }

          console.log(util.format(CON_GOT_STATS, playerId));

          if(jsonBody.meta.hidden !== null) { // hidden stats
            resolve(MSG_PROFILE_HIDDEN);
            return;
          } else if(jsonBody.data[playerId] === null) { // first battle ever
            resolve(MSG_NO_STATS);
            return;
          }

          let dataArray = jsonBody.data[playerId];
          let pvpStats = dataArray[0].pvp;

          if(pvpStats.battles === 0) { // first battle in pvp; we do get data for pve
            resolve(MSG_FIRST_PVP);
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
            winRate: (pvpStats.wins / pvpStats.battles) * 100, // percentage
            avgDmg: pvpStats.damage_dealt / pvpStats.battles,
            avgXp: pvpStats.xp / pvpStats.battles,
            survivalRate: (pvpStats.survived_battles / pvpStats.battles) * 100, // percentage
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
      throw new Error(ERR_WG_MAX_REQUESTS_NOT_SET);
    }
    // run WG_MAX_REQUESTS command at once, send once per (1 second / WG_MAX_REQUESTS)
    wgApiLimiter = new Bottleneck(parseInt(process.env.WG_MAX_REQUESTS), 1000 / parseInt(process.env.WG_MAX_REQUESTS));

    // init API URLs
    switch(process.env.WOWS_REGION) {
      case STR_REGION_ASIA:
        wargamingApiUrl = 'https://api.worldofwarships.asia/wows/';
        break;
      case STR_REGION_EU:
        wargamingApiUrl = 'https://api.worldofwarships.eu/wows/';
        break;
      case STR_REGION_NA:
        wargamingApiUrl = 'https://api.worldofwarships.com/wows/';
        break;
      case STR_REGION_RU:
        wargamingApiUrl = 'https://api.worldofwarships.ru/wows/';
        break;
      default:
        throw new Error(ERR_WOWS_REGION_NOT_SET);
    }

    if(process.env.WG_API_ID === undefined || process.env.WG_API_ID === '') {
      throw new Error(ERR_WG_API_ID_NOT_SET);
    }
    wargamingApiId = '?application_id=' + process.env.WG_API_ID;
  }
  initWgApis();

  return module;
};

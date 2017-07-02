/*
 * File name: replay_monitor.js
 * Description: Contains the functionality to monitor replays being made when a game is started.
 */

let Promise = require('bluebird');
let chokidar = require('chokidar');
let fs = require('fs');
let utilsStats = require('./utils_stats/js');
let wgApi = require('./wg_api.js');

// monitors replay being made when game starts
// just require() this
module.exports = function(wowsChannel) {
  let arenaJsonPath; // the path to tempArenaInfo.json
  let arenaJson = {}; // later filled with tempArenaInfo.json 
  let friendlyMsg = []; // messages for friendly team stats
  let enemyMsg = []; // messages for enemy team stats

  // used for array sorting
  function caseInsensitiveCompare(string1, string2) {
    var s1lower = string1.toLowerCase();
    var s2lower = string2.toLowerCase();

    if(s1lower < s2lower) {
      return -1;
    } else if(s1lower > s2lower) {
      return 1;
    } else {
      return 0;
    }
  };

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(path) {
    let hrStart = process.hrtime();

    fs.writeFileSync('./tempArenaJson2.json', fs.readFileSync(path));

    console.log('Loading file /tempArenaJson2.json...');
    wowsChannel.send('Detected a match! Loading player stats...');

    // parse json and build team arrays
    arenaJson = require('./tempArenaJson2.json'); // blocking operation, but we need to wait anyways
    friendlyMsg = [];
    enemyMsg = [];
    let playerAmount = arenaJson.vehicles.length;
    for(let vehicleIndex in arenaJson.vehicles) {
      if(!arenaJson.vehicles.hasOwnProperty(vehicleIndex)) {
        continue;
      }

      let player = arenaJson.vehicles[vehicleIndex];

      // get ID by name
      wgApi.wgSearchPlayerIdWrapper(player)
        .then((searchResult) => {
          let playerInfo = searchResult[0];
          let playerId = searchResult[1];

          wgApi.wgStats(playerId, playerInfo.shipId)
            .then((stats) => {

              wgApi.wgSearchShipName(playerInfo.shipId)
                .then((shipName) => {
                  let msg = utilsStats.formatStats(stats, playerInfo.name, shipName);
                  if(playerInfo.relation === 0 || playerInfo.relation === 1) {
                    friendlyMsg.push(msg);
                  } else {
                    enemyMsg.push(msg);
                  }

                  if(friendlyMsg.length === playerAmount / 2 && enemyMsg.length === playerAmount / 2) {
                    friendlyMsg.sort((string1, string2) => caseInsensitiveCompare(string1, string2));
                    enemyMsg.sort((string1, string2) => caseInsensitiveCompare(string1, string2));

                    wowsChannel.send('.\nFriendly Team\n====================');
                    for(let friendlyIndex in friendlyMsg) {
                      if(!friendlyMsg.hasOwnProperty(friendlyIndex)) {
                        continue;
                      }
                      wowsChannel.send(friendlyMsg[friendlyIndex]);
                    }

                    wowsChannel.send('.\nEnemy Team\n====================');
                    for(let enemyIndex in enemyMsg) {
                      if(!enemyMsg.hasOwnProperty(enemyIndex)) {
                        continue;
                      }
                      wowsChannel.send(enemyMsg[enemyIndex]);
                    }

                    let hrEnd = process.hrtime(hrStart);
                    console.log('It took ' + hrEnd[0] + ' seconds to load all stats.\n');
                  }
              });
          });
        });
    }
  };

  // init replay monitor
  function initReplayMonitor() {
    // make sure replay directory was set
    if(process.env.WOWS_REPLAY_FOLDER === undefined || process.env.WOWS_REPLAY_FOLDER === '') {
      throw new Error('WOWS_REPLAY_FOLDER was not set!');
    } else if (!fs.existsSync(process.env.WOWS_REPLAY_FOLDER)) { // make sure directory is valid
      throw new Error('The directory WOWS_REPLAY_FOLDER does not exist! ' + 
          'Make sure replays are enabled and/or the replays folder exists.');
    }
    arenaJsonPath = process.env.WOWS_REPLAY_FOLDER + 'tempArenaInfo.json';
  };
  initReplayMonitor();

  // watch for tempArenaInfo.json with player info created by wows
  let watcher = chokidar.watch(arenaJsonPath, {
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100
    }
  });
  watcher.on('add', (path) => processMatch(path)); // TODO: seems to hang wows loading
};

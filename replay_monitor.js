/*
 * File name: replay_monitor.js
 * Description: Contains the functionality to monitor replays being made when a game is started.
 */

let Promise = require('bluebird');
let chokidar = require('chokidar');
let fs = require('fs');
let utilsStats = require('./utils_stats.js')();
let wgApi = require('./wg_api.js')();

// monitors replay being made when game starts
// require() this and pass in the Discord.js channel the messages will be sent to
module.exports = function(wowsChannel) {
  let arenaJsonPath; // the path to tempArenaInfo.json
  let arenaJson = {}; // later filled with tempArenaInfo.json
  let friendlyMsg = []; // friendly team stats
  let enemyMsg = []; // enemy team stats
  let watcher; // chokidar watcher on tempArenaInfo.json

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(path) {
    let hrStart = process.hrtime();

    fs.writeFileSync('./tempArenaJson2.json', fs.readFileSync(path));
    // watcher.close(); // after we copy we no longer need to watch the original

    console.log('Loading file ./tempArenaJson2.json...');
    wowsChannel.send('Detected a match! Loading player stats...');

    // parse json and build team arrays
    arenaJson = require('./tempArenaJson2.json'); // blocking operation, but we need to wait anyways
    let processedPlayers = 0;
    let totalPlayers = arenaJson.vehicles.length;
    friendlyMsg = [];
    enemyMsg = [];
    
    for(let vehicleIndex in arenaJson.vehicles) {
      if(!arenaJson.vehicles.hasOwnProperty(vehicleIndex)) {
        continue;
      }

      let player = arenaJson.vehicles[vehicleIndex];
      let playerId;
      let stats;
      let shipName;
      wgApi.searchPlayerId(player.name) // get player ID
        .then((tmpPlayerId) => {
          playerId = tmpPlayerId;
          return wgApi.stats(playerId, player.shipId);
        })
        .then((tmpStats) => { // get stats of player/ship
          stats = tmpStats;
          return wgApi.searchShipName(player.shipId);
        })
        .then((tmpShipName) => { // allocate by teams
          return new Promise((resolve, reject) => {
            shipName = tmpShipName;
            let msg = utilsStats.formatStats(stats, player.name, shipName);

            if(player.relation === 0 || player.relation === 1) {
              friendlyMsg.push(msg + '\n');
            } else if(player.relation === 2) {
              enemyMsg.push(msg + '\n');
            }

            processedPlayers++;
            resolve();
          });
        })
        .then(() => { // prepare message arrays for sending 
          // only begin sending once all stats have been retrieved
          if(processedPlayers === totalPlayers) {
            // concat and sort team stat message arrays
            // TODO: sorted inserts?
            friendlyMsg.sort(utilsStats.caseInsensitiveCompare);
            friendlyMsg.unshift('\n=====\nFriendly Team\n=====\n');
            enemyMsg.sort(utilsStats.caseInsensitiveCompare);
            enemyMsg.unshift('\n=====\nEnemy Team\n=====\n');
            let allMsg = friendlyMsg.concat(enemyMsg);

            // combine as many messages as we can under the discord 2000 char limit
            // to reduce spam sending messages
            let tmpMsg = '';
            do {
              if(tmpMsg.length + allMsg[0].length <= 2000) {
                tmpMsg += allMsg.shift();
              } else {
                wowsChannel.send(tmpMsg);
                tmpMsg = '';
              }
            } while(allMsg.length > 0);         

            let hrEnd = process.hrtime(hrStart);
            console.log('It took ' + hrEnd[0] + ' seconds to load all stats.\n');

            // initWatcher(); // rewatch file after everything is done 
          }
        })
        .catch((rejectReason) => {
          console.log('Error during processMatch(): ' + rejectReason);
          wowsChannel.send('**Error:** Something went wrong while processing the match.\n'
              + 'Some stats may be missing.');
          processedPlayers++;
        });
    }

    return;
  }

  // reinit chokidar watcher
  function initWatcher() {
    // watch for tempArenaInfo.json with player info created by wows
    watcher = chokidar.watch(arenaJsonPath, {
      usePolling: {
        interval: 2000,
        binaryInterval: 3000
      },
      // usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 1000
      }
    });
    watcher.on('add', processMatch); // FIXME: seems to hang wows loading
  }

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
    initWatcher();
  }
  initReplayMonitor();
};

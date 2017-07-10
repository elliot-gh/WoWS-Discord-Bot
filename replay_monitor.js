/*
 * File name: replay_monitor.js
 * Description: Contains the functionality to monitor replays being made when a game is started.
 */

const Promise = require('bluebird');
let chokidar = require('chokidar');
let fs = require('fs');
let utilsStats = require('./utils_stats.js')();
let wgApi = require('./wg_api.js')();

// monitors replay being made when game starts
// require() this and pass in the Discord.js channel the messages will be sent to
module.exports = function(wowsChannel) {
  let module = {};
  let arenaJsonPath; // the path to tempArenaInfo.json
  let arenaJson = {}; // later filled with tempArenaInfo.json
  let friendlyMsg = []; // friendly team stats
  let enemyMsg = []; // enemy team stats
  let watcher = undefined; // chokidar watcher on tempArenaInfo.json

  // common/error strings
  const MATCH_DETECTED = 'Detected a match! Beginning match processing...';
  const CURRENT_PATH = './';
  const TEMPARENAJSON_ORIGINAL = 'tempArenaInfo.json';
  const TEMPARENAJSON_NEW = 'tempArenaInfo2.json';
  const ERROR_DURING_PROCESS_MATCH = '**ERROR**: Error while processing match. Some stats may be missing:\n';
  const ERROR_WOWS_REPLAY_FOLDER_NOT_SET = 'WOWS_REPLAY_FOLDER was not set!';
  const ERROR_WOWS_REPLAY_FOLDER_MISSING = 'The WOWS_REPLAY_FOLDER directory does not exist! Make sure replays are enabled and/or the replays folder exists.';

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(path) {
    let hrStart = process.hrtime();

    // create a copy in the bot directory to read off of
    // also helps to debug if a certain tempArenaJson.json breaks something
    fs.writeFileSync(CURRENT_PATH + TEMPARENAJSON_NEW, fs.readFileSync(path));
    console.log(MATCH_DETECTED);
    console.log('Copying ' + path + ' to ' + CURRENT_PATH + TEMPARENAJSON_NEW + '...\n');
    wowsChannel.send(MATCH_DETECTED);

    // parse copied json and build team arrays
    arenaJson = JSON.parse(fs.readFileSync(CURRENT_PATH + TEMPARENAJSON_NEW));
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
        .catch((rejectReason) => {
          return new Promise((resolve, reject) => {
            console.log(ERROR_DURING_PROCESS_MATCH + rejectReason + '\n');
            wowsChannel.send(ERROR_DURING_PROCESS_MATCH + rejectReason + '\n');
            processedPlayers++;
            resolve();
          });
        })
        .then(() => { // prepare message arrays for sending 
          // only begin sending once all stats have been retrieved
          if(processedPlayers === totalPlayers) {
            // concatenate and sort team stat message arrays
            // TODO: sorted inserts?
            friendlyMsg.sort(utilsStats.caseInsensitiveCompare);
            friendlyMsg.unshift('\n==========\nFriendly Team\n==========\n\n');
            enemyMsg.sort(utilsStats.caseInsensitiveCompare);
            enemyMsg.unshift('\n=========\nEnemy Team\n=========\n\n');
            let allMsg = friendlyMsg.concat(enemyMsg);

            // combine as many messages as we can under the discord 2000 char limit
            // this reduces spamming send() and speeds things up quite a bit
            let tmpMsg = '';
            while(allMsg.length > 0) {
              // Discord's max char limit per message is 2000, however
              // it is set to 1998 to account for period + new line.
              // .\n improves readability on the Discord compact setting
              // so that the message doesn't start on the same line as the name
              if(tmpMsg.length + allMsg[0].length <= 1998) {
                tmpMsg += allMsg.shift();
              } else {
                wowsChannel.send('.\n' + tmpMsg);
                tmpMsg = '';
              }
            }

            // if we have leftover messages because they were small enough, send it
            if(tmpMsg !== '') {
              wowsChannel.send('.\n' + tmpMsg);
              tmpMsg = '';
            }

            let hrEnd = process.hrtime(hrStart);
            console.log('\nIt took ' + hrEnd[0] + ' seconds to load all stats.\n');
          }
        });
    }

    return;
  }

  // reinit chokidar watcher
  function initWatcher(path) {
    // if we're here again (probably due to an unlink event), close and rewatch the new file
    // this is because Node's fs will continue to watch the old deleted file 
    // and we get some weird behavior from that
    if(watcher !== undefined) {
      console.log(path + ' was deleted or changed (probably due to loading into a new game).\n');
      watcher.close();
    }
    
    // watch for tempArenaInfo.json with player info created by wows
    watcher = chokidar.watch(arenaJsonPath, {
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 1000
      }
    });

    console.log('Watching for file: ' + arenaJsonPath + '\n');

    watcher.on('add', processMatch); // wows has loaded into a match
    watcher.on('unlink', initWatcher); // reinit watcher to watch new file/inode
    watcher.on('change', initWatcher); // reinit watcher to watch new file/inode
  }

  // init replay monitor
  function initReplayMonitor() {
    // make sure replay directory was set
    if(process.env.WOWS_REPLAY_FOLDER === undefined || process.env.WOWS_REPLAY_FOLDER === '') {
      throw new Error(ERROR_WOWS_REPLAY_FOLDER_NOT_SET);
    } else if (!fs.existsSync(process.env.WOWS_REPLAY_FOLDER)) { // make sure directory is valid
      throw new Error(ERROR_WOWS_REPLAY_FOLDER_MISSING);
    }
    arenaJsonPath = process.env.WOWS_REPLAY_FOLDER + TEMPARENAJSON_ORIGINAL;
    initWatcher();
  }
  initReplayMonitor();

  return module;
};

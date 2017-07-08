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
  let watcher = undefined; // chokidar watcher on tempArenaInfo.json

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(path) {
    let hrStart = process.hrtime();

    // create a copy in the bot directory to read off of
    // also helps to debug if a certain tempArenaJson.json breaks something
    fs.writeFileSync('./tempArenaJson2.json', fs.readFileSync(path));
    console.log('Detected a match! Begin match processing.');
    console.log('Copying ' + path + ' to ./tempArenaJson2.json...');
    console.log('Loading file ./tempArenaJson2.json...\n');
    wowsChannel.send('Detected a match! Loading player stats...');

    // parse copied json and build team arrays
    arenaJson = JSON.parse(fs.readFileSync('./tempArenaJson2.json'));
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
            console.log('Error during processMatch(): ' + rejectReason + '\n');
            wowsChannel.send('**Error while processing match:** ' + rejectReason
                + '\nSome stats may be missing.');
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
            friendlyMsg.unshift('.\n==========\nFriendly Team\n==========\n\n');
            enemyMsg.sort(utilsStats.caseInsensitiveCompare);
            enemyMsg.unshift('\n=========\nEnemy Team\n=========\n\n');
            let allMsg = friendlyMsg.concat(enemyMsg);

            // combine as many messages as we can under the discord 2000 char limit
            // this reduces spamming send() and speeds things up quite a bit
            let tmpMsg = '';
            while(allMsg.length > 0) {
              if(tmpMsg.length + allMsg[0].length <= 2000) {
                tmpMsg += allMsg.shift();
              } else {
                wowsChannel.send(tmpMsg);
                tmpMsg = '';
              }
            }

            // if we have leftover messages because they were small enough, send it
            if(tmpMsg !== '') {
              wowsChannel.send(tmpMsg);
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
      console.log(path + ' was deleted or changed (probably due to loading into a new game).\n'
          + 'Rewatching ' + arenaJsonPath + '.\n');
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

    watcher.on('add', processMatch); // wows has loaded into a match
    watcher.on('unlink', initWatcher); // reinit watcher to watch new file/inode
    watcher.on('change', initWatcher); // reinit watcher to watch new file/inode
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

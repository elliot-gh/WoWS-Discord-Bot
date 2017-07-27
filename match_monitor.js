/*
 * File name: match_monitor.js
 * Description: Contains the functionality to monitor replays being made when a game is started.
 */

const Promise = require('bluebird');
const chokidar = require('chokidar');
const fs = require('fs');
const util = require('util');
const utilsStats = require('./utils_stats.js')();
const wgApi = require('./wg_api.js')();

// monitors replay being made when game starts
// require() this and pass in the Discord.js channel the messages will be sent to
module.exports = function(wowsChannel) {
  let module = {}; // this module
  let watcher = undefined; // chokidar watcher on tempArenaInfo.json

  // constant values
  const DISCORD_MAX_CHAR = 2000; // Discord's max char per message
  const LENGTH_MSG_COMPACT_PREFIX = 2; // see below under message strings

  // program strings
  const STR_ARENA_NEW = 'tempArenaInfo2.json';
  const STR_ARENA_ORIGINAL = 'tempArenaInfo.json';
  const STR_CURRENT_PATH = './';

  // message strings
  let MSG_COMPACT_PREFIX = '%s'; // assists readability in Discord compact
  const MSG_MATCH_DETECTED = 'Detected a match! Loading player stats...';
  const MSG_STAT = '%s\n'; // indvidiual stat message
  const MSG_TEAM_ENEMY = '\n=========\nEnemy Team\n=========\n\n';
  const MSG_TEAM_FRIENDLY = '==========\nFriendly Team\n==========\n\n';
  const MSG_UNKNOWN_TEAM = '*Unknown Team*: %s\n';

  // console strings
  const CON_ARENA_CHANGE = '\n%s was deleted or changed (probably due to loading into a new game).\n'; // replay path
  const CON_ARENA_WATCHING = 'Watching for file: %s\n';
  const CON_COPYING = 'Copying %s to %s%s...\n'; // replay path, bot path, new file name
  const CON_MATCH_DETECTED = '\n===============\nDetected a match! Beginning match processing...';
  const CON_PROCESS_TIME = '\nIt took %d seconds to load all stats.\n===============\n'; // time in seconds
  
  // error strings
  const ERR_COMPACT_MSG_FORMAT_NOT_SET = 'COMPACT_MSG_FORMAT was not set!';
  const ERR_DURING_PROCESS_MATCH = 'ERROR: Error while processing match. Some stats may be missing: %s\n';
  const ERR_DURING_PROCESS_MATCH_MSG = '**ERROR**: Error while processing match. Additional errors will not be sent here and will only be logged in the bot console. Some stats may be missing:\n%s\n\n';
  const ERR_WOWS_REPLAY_FOLDER_MISSING = 'The WOWS_REPLAY_FOLDER directory does not exist! Make sure replays are enabled and/or the replays folder exists.\n'; // path set to
  const ERR_WOWS_REPLAY_FOLDER_NOT_SET = 'WOWS_REPLAY_FOLDER was not set!';

  // run when match start is detected
  // reads the tempArenaInfo.json file that is created by wows
  function processMatch(replayPath) {
    let hrStart = process.hrtime(); // timing how long it takes to load all stats

    // create a copy in the bot directory to read off of
    // also helps to debug if a specific tempArenaJson.json breaks something
    fs.writeFileSync(STR_CURRENT_PATH + STR_ARENA_NEW, fs.readFileSync(replayPath));
    console.log(CON_MATCH_DETECTED);
    console.log(util.format(CON_COPYING, replayPath, STR_CURRENT_PATH, STR_ARENA_NEW));
    wowsChannel.send(MSG_MATCH_DETECTED);

    // parse copied json and build team arrays
    let arenaJson = JSON.parse(fs.readFileSync(STR_CURRENT_PATH + STR_ARENA_NEW));
    let allPlayers = arenaJson.vehicles;
    let totalPlayers = allPlayers.length; // total players
    let processedPlayers = 0; // total players processed
    let friendlyMsg = []; // array of friendly team stat messages
    let enemyMsg = []; // array of enemy team stat messages
    let error = false; // whether an error was encountered

    wgApi.searchMultiplePlayerIds(allPlayers)
      .then((allPlayerIds) => {
        let matching = allPlayerIds.matching;
        let missing = allPlayerIds.missing;

        for(let missingIndex in missing) {
          if(!missing.hasOwnProperty(missingIndex)) {
            continue;
          }

          let player = missing[missingIndex];

          if(player.relation === 0 || player.relation === 1) { // yourself/friendly
            friendlyMsg.push(util.format(ERR_DURING_PROCESS_MATCH_MSG, player.reason));
          } else if(player.relation === 2) { // enemy
            enemyMsg.push(util.format(ERR_DURING_PROCESS_MATCH_MSG, player.reason));
          } else { // no proper relation for some reason; stick to end
            enemyMsg.push(util.format(MSG_UNKNOWN_TEAM, player.reason));
          }

          processedPlayers++;
        }

        // loop through every found player
        for(let matchingIndex in matching) {
          if(!matching.hasOwnProperty(matchingIndex)) {
            continue;
          }

          let player = matching[matchingIndex];
          let playerId = player.playerId;
          let stats;
          let shipName;

          wgApi.stats(playerId, player.shipId) // get stats of player/ship
            .then((tmpStats) => { 
              stats = tmpStats;
              return wgApi.searchShipName(player.shipId); // get ship name
            })
            .then((tmpShipName) => { // allocate by teams
              return new Promise((resolve, reject) => {
                shipName = tmpShipName;
                let msg = utilsStats.formatStats(player.name, shipName, stats);

                if(player.relation === 0 || player.relation === 1) { // yourself/friendly
                  friendlyMsg.push(util.format(MSG_STAT, msg));
                } else if(player.relation === 2) { // enemy
                  enemyMsg.push(util.format(MSG_STAT, msg));
                }

                processedPlayers++;
                resolve();
              });
            })
            .catch((rejectReason) => { // catch any errors and print/send them out
              return new Promise((resolve, reject) => {
                if(!error) { // we don't want to keep spamming error messages
                  wowsChannel.send(util.format(ERR_DURING_PROCESS_MATCH_MSG, rejectReason));
                }
                
                error = true;
                // TODO: remove this or figure out something for duplication of errors in console
                console.log(util.format(ERR_DURING_PROCESS_MATCH, rejectReason));
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
                friendlyMsg.unshift(MSG_TEAM_FRIENDLY);
                enemyMsg.sort(utilsStats.caseInsensitiveCompare);
                enemyMsg.unshift(MSG_TEAM_ENEMY);
                let allMsg = friendlyMsg.concat(enemyMsg);

                // combine as many messages as we can under the Discord char limit
                // this reduces spamming send() and speeds things up quite a bit
                let tmpMsg = '';
                while(allMsg.length > 0) {
                  // our max char limit per message is set to
                  // (DISCORD_MAX_CHAR - LENGTH_MSG_COMPACT_PREFIX) to account for MSG_COMPACT_PREFIX
                  // MSG_COMPACT_PREFIX improves readability on the Discord compact setting
                  // so that the message doesn't start on the same line as the name
                  if((tmpMsg.length + allMsg[0].length) <= 
                      (DISCORD_MAX_CHAR - LENGTH_MSG_COMPACT_PREFIX)) {
                    tmpMsg += allMsg.shift();
                  } else {
                    wowsChannel.send(util.format(MSG_COMPACT_PREFIX, tmpMsg));
                    tmpMsg = '';
                  }
                }

                // if we have leftover messages because they were small enough, send it
                if(tmpMsg !== '') {
                  wowsChannel.send(util.format(MSG_COMPACT_PREFIX, tmpMsg));
                  tmpMsg = '';
                }

                let hrEnd = process.hrtime(hrStart);
                console.log(util.format(CON_PROCESS_TIME, hrEnd[0]));
              }
            });
        }
    });

    return;
  }

  // init or reinit chokidar watcher
  function initWatcher(replayPath) {
    // if we're here again (probably due to an unlink event), close and rewatch the new file
    // this is because Node's fs will continue to watch the old deleted file 
    // and we get some weird behavior from that
    if(watcher !== undefined) {
      console.log(util.format(CON_ARENA_CHANGE, replayPath));
      watcher.close();
    }
    
    // watch for tempArenaInfo.json with player info created by wows
    watcher = chokidar.watch(replayPath, {
      usePolling: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 1000
      }
    });

    console.log(util.format(CON_ARENA_WATCHING, replayPath));

    watcher.on('add', processMatch); // wows has loaded into a match
    watcher.on('unlink', initWatcher); // reinit watcher to watch new file/inode
    watcher.on('change', initWatcher); // reinit watcher to watch new file/inode
  }

  // init replay monitor
  function initReplayMonitor() {
    // make sure compact prefix option is set
    if(process.env.COMPACT_MSG_FORMAT === 'true') {
      MSG_COMPACT_PREFIX = '.\n%s';
    } else if(process.env.COMPACT_MSG_FORMAT !== 'false' || 
        process.env.COMPACT_MSG_FORMAT === undefined || process.env.COMPACT_MSG_FORMAT === '') {
      throw new Error(ERR_COMPACT_MSG_FORMAT_NOT_SET);
    }

    // make sure replay directory was set
    if(process.env.WOWS_REPLAY_FOLDER === undefined || process.env.WOWS_REPLAY_FOLDER === '') {
      throw new Error(ERR_WOWS_REPLAY_FOLDER_NOT_SET);
    } else if (!fs.existsSync(process.env.WOWS_REPLAY_FOLDER)) { // make sure directory is valid
      throw new Error(ERR_WOWS_REPLAY_FOLDER_MISSING);
    }
    let arenaJsonPath = process.env.WOWS_REPLAY_FOLDER + STR_ARENA_ORIGINAL;
    initWatcher(arenaJsonPath);
  }
  initReplayMonitor();

  return module;
};

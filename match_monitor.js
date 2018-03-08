/*
 * File name: match_monitor.js
 * Description: Contains the functionality to monitor replays being made when a game is started.
 */

const chokidar = require('chokidar');
const fs = require('fs');
const util = require('util');
const utilsStats = require('./utils_stats.js')();
const wgApi = require('./wg_api.js')();

// monitors replay being made when game starts
// require() this and pass in the Discord.js channel the messages will be sent to
module.exports = function(wowsChannel) {
  let module = {}; // this module
  let watcher; // chokidar watcher on tempArenaInfo.json

  // constant values
  const DISCORD_MAX_CHAR_EMBED = 2048; // Discord's max char per embed description
  const COLOR_ENEMY = 0xFF0000; // red
  const COLOR_FRIENDLY = 0x00FF00; // green
  const COLOR_ERR = 0xFFA500; // orange

  // program strings
  const STR_ARENA_NEW = 'tempArenaInfo2.json';
  const STR_ARENA_ORIGINAL = 'tempArenaInfo.json';
  const STR_CURRENT_PATH = './';

  // message strings
  const MSG_MATCH_DETECTED = 'Detected a match! Loading player stats...';
  const MSG_STAT = '%s\n'; // indvidiual stat message
  const MSG_TEAM_ENEMY = 'Enemy Team Stats %d/%d';
  const MSG_TEAM_FRIENDLY = 'Friendly Team Stats %d/%d';
  const MSG_UNKNOWN_TEAM = '*Unknown Team*: %s\n';

  // console strings
  const CON_ARENA_CHANGE = '\n%s was deleted or changed (probably due to loading into a new game).\n'; // replay path
  const CON_ARENA_WATCHING = 'Watching for file: %s\n';
  const CON_COPYING = 'Copying %s to %s%s...\n'; // replay path, bot path, new file name
  const CON_MATCH_DETECTED = '\n===============\nDetected a match! Beginning match processing...';
  const CON_PROCESS_TIME = '\nIt took %d seconds to load all stats.\n===============\n'; // time in seconds
  
  // error strings
  const ERR_DURING_MSG_SEND = 'ERROR: Error while sending Discord message: %s';
  const ERR_DURING_PROCESS_MATCH = 'ERROR: Error while processing match: %s\n';
  const ERR_DURING_PROCESS_MATCH_MSG = 'Error(s) while processing match. Additional errors will not be sent here and will only be logged in the console. Some stats may be missing.';
  const ERR_MSG = 'ERROR';
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
    wowsChannel.send(MSG_MATCH_DETECTED)
      .catch((sendError) => {
        console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
      });

    // parse copied json and build team arrays
    let arenaJson = JSON.parse(fs.readFileSync(STR_CURRENT_PATH + STR_ARENA_NEW));
    let allPlayers = arenaJson.vehicles;
    let totalPlayers = allPlayers.length; // total players
    let processedPlayers = 0; // total players processed
    let friendlyMsg = []; // array of friendly team stat messages
    let enemyMsg = []; // array of enemy team stat messages
    let error = false; // whether an error was encountered

    // process each player found
    wgApi.searchMultiplePlayerIds(allPlayers)
      .then((allPlayerIds) => {
        let message = allPlayerIds.message;
        let matching = allPlayerIds.matching;
        let missing = allPlayerIds.missing;

        // mult search had an issue, probably due to fallback to one by one
        if(message !== undefined) {
          wowsChannel.send('', {
            embed: {
              title: ERR_MSG,
              type: 'rich',
              description: message,
              color: COLOR_ERR
            }
          })
            .catch((sendError) => {
              console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
            });
        }

        // if we couldn't resolve some names, print only one message
        if(!error && missing.length > 0) {
          error = true;
          processedPlayers += missing.length;
          wowsChannel.send('', {
            embed: {
              title: ERR_MSG,
              type: 'rich',
              description: ERR_DURING_PROCESS_MATCH_MSG,
              color: COLOR_ERR
            }
          })
            .catch((sendError) => {
              console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
            });
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
                  wowsChannel.send(util.format(ERR_DURING_PROCESS_MATCH_MSG, rejectReason))
                    .catch((sendError) => {
                      console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
                    });
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
                enemyMsg.sort(utilsStats.caseInsensitiveCompare);

                // combine as many messages as we can under the Discord char limit
                // this reduces spamming send() and speeds things up quite a bit
                // discord.js's native split doesn't really have the behavior 
                // we want, since it splits within stats as well
                let friendlyFormatted = [];
                let enemyFormated = [];
                let tmpMsg = '';

                // format friendly team first
                while(friendlyMsg.length > 0) {
                  if((tmpMsg.length + friendlyMsg[0].length) <= // keep adding messages with new lines as long as there's space
                      (DISCORD_MAX_CHAR_EMBED - 1)) {
                    tmpMsg += friendlyMsg.shift();
                    if(friendlyMsg.length === 0) { // if at last, then push
                      friendlyFormatted.push(tmpMsg);
                      tmpMsg = '';
                    }
                  } else if((tmpMsg.length + friendlyMsg[0].length) <= // if there's space for the message but no new line,
                      (DISCORD_MAX_CHAR_EMBED)) {                      // add the message and push to final array
                    tmpMsg += friendlyMsg.shift();
                    friendlyFormatted.push(tmpMsg);
                    tmpMsg = '';
                  } else { // if there's no space at all then push to array
                    friendlyFormatted.push(tmpMsg);
                    tmpMsg = '';
                  }
                }

                for(let friendlyIndex = 0; friendlyIndex < friendlyFormatted.length; friendlyIndex++) {
                  wowsChannel.send('', {
                    embed: {
                      title: util.format(MSG_TEAM_FRIENDLY, friendlyIndex + 1, friendlyFormatted.length),
                      type: 'rich',
                      description: friendlyFormatted[friendlyIndex],
                      color: COLOR_FRIENDLY
                    }
                  })
                    .catch((sendError) => {
                      console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
                    });
                }

                // format enemy team next
                while(enemyMsg.length > 0) {
                  if((tmpMsg.length + enemyMsg[0].length) <= // keep adding messages with new lines as long as there's space
                      (DISCORD_MAX_CHAR_EMBED - 1)) {
                    tmpMsg += enemyMsg.shift();
                    if(enemyMsg.length === 0) { // if at last, then push
                      enemyFormated.push(tmpMsg);
                      tmpMsg = '';
                    }
                  } else if((tmpMsg.length + enemyMsg[0].length) <= // if there's space for the message but no new line,
                      (DISCORD_MAX_CHAR_EMBED)) {                      // add the message and push to final array
                    tmpMsg += enemyMsg.shift();
                    enemyFormated.push(tmpMsg);
                    tmpMsg = '';
                  } else { // if there's no space at all then push to array
                    enemyFormated.push(tmpMsg);
                    tmpMsg = '';
                  }
                }

                for(let enemyIndex = 0; enemyIndex < enemyFormated.length; enemyIndex++) {
                  wowsChannel.send('', {
                    embed: {
                      title: util.format(MSG_TEAM_ENEMY, enemyIndex + 1, enemyFormated.length),
                      type: 'rich',
                      description: enemyFormated[enemyIndex],
                      color: COLOR_ENEMY
                    }
                  })
                    .catch((sendError) => {
                      console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
                    });
                }

                let hrEnd = process.hrtime(hrStart);
                console.log(util.format(CON_PROCESS_TIME, hrEnd[0]));
              }
            });
        }
    })
    .catch((rejectReason) => { // catch any errors and print/send them out
      return new Promise((resolve, reject) => {
        if(!error) { // we don't want to keep spamming error messages
          wowsChannel.send(util.format(ERR_DURING_PROCESS_MATCH_MSG, rejectReason))
            .catch((sendError) => {
              console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
            });
        }
        
        error = true;
        // TODO: remove this or figure out something for duplication of errors in console
        console.log(util.format(ERR_DURING_PROCESS_MATCH, rejectReason));
        processedPlayers++;
        resolve();
      });
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
  (function initReplayMonitor() {
    // make sure replay directory was set
    if(process.env.WOWS_REPLAY_FOLDER === undefined || process.env.WOWS_REPLAY_FOLDER === '') {
      throw new Error(ERR_WOWS_REPLAY_FOLDER_NOT_SET);
    } else if (!fs.existsSync(process.env.WOWS_REPLAY_FOLDER)) { // make sure directory is valid
      throw new Error(ERR_WOWS_REPLAY_FOLDER_MISSING);
    }
    let arenaJsonPath = process.env.WOWS_REPLAY_FOLDER + STR_ARENA_ORIGINAL;
    initWatcher(arenaJsonPath);
  }) ();

  return module;
};

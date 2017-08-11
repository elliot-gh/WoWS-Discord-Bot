/*
 * File name: wows_bot.js
 * Description: Listens for new WowS matches and checks the stats of WoWS players.
 */

const Promise = require('bluebird');
const wgApi = require('./wg_api.js')();
const util = require('util');
const utilsStats = require('./utils_stats.js')();
let replayMonitor;

// contains the Discord bot
// require() this and pass in the discord.js logged in client
module.exports = function(client) {
  let module = {}; // this module
  let wowsChannel; // the discord channel to send messages in, used by discord.js

  // constant values
  const CMD_WGSTATS_ARGS_MIN = 3;
  const CMD_WGSTATS_ARGS_PLAYER = 1;
  const CMD_WGSTATS_ARGS_SHIP = 2;
  const CMD_WGSTATS_PREFIX_LENGTH = 8;
  const COLOR_CMD = 0x8C8F91; // discord message grey
  const COLOR_ERR = 0xFFA500; // orange

  // program strings
  const STR_CMD_WGSTATS_PREFIX = '!wgstats';
  const STR_CMD_WGSTATS_ARGS = '[user] [ship]';
  const STR_CMD_WGSTATS_FULL = STR_CMD_WGSTATS_PREFIX + ' ' + STR_CMD_WGSTATS_ARGS;

  // message strings
  const MSG_STATS_RESULT = 'Ship Stats';

  // console strings
  const CON_CHAT_COMMAND = '\nChat command: %s'; // chat command logged

  // error strings
  const ERR_COMMAND_FAILED = 'Command failed!'; // failure
  const ERR_COMMAND_FAILED_PREFIX = '**Command failed**: %s'; // failure with message
  const ERR_COMMAND_WARNING = '**Command warning:** %s\n\n%s\n'; // warning reason, full warning
  const ERR_COMMAND_FAILED_INVALID_FORMAT = util.format('Invalid command format! The command is `%s`', STR_CMD_WGSTATS_FULL);
  const ERR_DEFAULT_WOWS_CHANNEL_NOT_SET = 'DEFAULT_WOWS_CHANNEL was not set!';
  const ERR_DURING_MSG_SEND = 'ERROR: Error while sending Discord message: %s';
  const ERR_MATCH_MONITOR_ON_NOT_SET = 'MATCH_MONITOR_ON was not set!';

  // inits the vars
  (function initBot() {
    client.user.setPresence({
      'status': 'online',
      'afk': false,
      'game': {
        'name': STR_CMD_WGSTATS_FULL
      }
    });

    // make sure discord channel was set 
    if(process.env.DEFAULT_WOWS_CHANNEL === undefined || process.env.DEFAULT_WOWS_CHANNEL === '') {
      throw new Error(ERR_DEFAULT_WOWS_CHANNEL_NOT_SET);
    }
    wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);

    // see if we want to watch replay 
    if(process.env.REPLAY_MONITOR_ON === 'true') {
      replayMonitor = require('./match_monitor.js')(wowsChannel);
    } else if(process.env.REPLAY_MONITOR_ON !== 'false' || 
        process.env.REPLAY_MONITOR_ON === undefined || process.env.REPLAY_MONITOR_ON === '') {
      throw new Error(ERR_MATCH_MONITOR_ON_NOT_SET);
    }
  }) ();

  // ----- chat commands -----
  client.on('message', (msg) => {
    let msgContent = msg.content;

    // !wgstats [account name] [ship name] will query stats for that player and ship
    if(msgContent.substring(0, CMD_WGSTATS_PREFIX_LENGTH) === STR_CMD_WGSTATS_PREFIX) {
      console.log(util.format(CON_CHAT_COMMAND), msgContent);

      let channel = msg.channel;
      let msgArray = msgContent.split(' '); // split by space

      if(msgArray.length < CMD_WGSTATS_ARGS_MIN) { // missing args
        channel.send('', {
          embed: {
            title: ERR_COMMAND_FAILED,
            type: 'rich',
            description: ERR_COMMAND_FAILED_INVALID_FORMAT,
            color: COLOR_ERR
          }
        })
          .catch((sendError) => {
            console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
          });
        return;
      }

      // parse chat command for name and ship name
      let playerName = msgArray[CMD_WGSTATS_ARGS_PLAYER];
      let shipName = '';
      for(let shipIndex = CMD_WGSTATS_ARGS_SHIP; shipIndex < msgArray.length; shipIndex++) {
        shipName += msgArray[shipIndex];
        if(shipIndex !== msgArray.length - 1) {
          shipName += ' ';
        }
      }

      let playerId; // player ID of the requested player name
      let shipId; // ship ID of the requested ship name
      let actualShipName; // the actual ship name
      let searchShipIdMsg; // return value of searchShipId(); lets us know about typos
      wgApi.searchPlayerId(playerName)
        .then((tmpPlayerId) => { // get player ID from name
          playerId = tmpPlayerId;
          return wgApi.searchShipId(shipName);
        })
        .then((tmpShipIdResult) => { // get ship ID from name
          shipId = tmpShipIdResult.id;
          actualShipName = tmpShipIdResult.name;
          searchShipIdMsg = tmpShipIdResult.message;
          return wgApi.stats(playerId, shipId);
        })
        .then((stats) => { // get actual stats
          let statsMsg = utilsStats.formatStats(playerName, actualShipName, stats);
          if(searchShipIdMsg !== '') { // warning
            statsMsg = util.format(ERR_COMMAND_WARNING, searchShipIdMsg, statsMsg);
          }
          
          channel.send('', {
            embed: {
              title: MSG_STATS_RESULT,
              type: 'rich',
              description: statsMsg,
              color: COLOR_CMD
            }
          })
            .catch((sendError) => {
              console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
            });
          return;
        })
        .catch((rejectReason) => { // catch errors
          // TODO: remove this or figure out something for duplication of errors in console
          console.log(util.format(ERR_COMMAND_FAILED_PREFIX, rejectReason));

          channel.send('', {
            embed: {
              title: ERR_COMMAND_FAILED,
              type: 'rich',
              description: rejectReason,
              color: COLOR_ERR
            }
          })
            .catch((sendError) => {
              console.log(util.format(ERR_DURING_MSG_SEND, sendError.message));
            });

          return;
        });

      return;
    }
  });

  return module;
};

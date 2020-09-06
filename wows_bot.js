/*
 * File name: wows_bot.js
 * Description: Listens for new WowS matches and checks the stats of WoWS players.
 */

const wgApi = require('./wg_api.js')();
const util = require('util');
const utilsStats = require('./utils_stats.js')();

// contains the Discord bot
// require() this and pass in the discord.js logged in client
module.exports = function(client) {
  let module = {}; // this module

  // constant values
  const CMD_WGSTATS_ARGS_MIN = 3;
  const CMD_WGSTATS_ARGS_PLAYER = 1;
  const CMD_WGSTATS_ARGS_SHIP = 2;
  const COLOR_CMD = 0x8C8F91; // discord message grey
  const COLOR_ERR = 0xFFA500; // orange

  // program strings
  const STR_CMD_HELP = '!help';
  const STR_CMD_HELP_TITLE = 'Help';
  const STR_CMD_WG_PREFIX = '!wg';
  const STR_CMD_WG_FULL = '`!wg[na|eu|asia|ru] [user] [ship]`';
  const STR_REGION_ASIA = 'asia';
  const STR_REGION_EU = 'eu';
  const STR_REGION_NA = 'na';
  const STR_REGION_RU = 'ru';

  // message strings
  const MSG_STATS_RESULT = 'Ship Stats';

  // console strings
  const CON_CHAT_COMMAND = '\nChat command: %s'; // chat command logged

  // error strings
  const ERR_COMMAND_FAILED = 'Command failed!'; // failure
  const ERR_COMMAND_FAILED_PREFIX = '**Command failed**: %s'; // failure with message
  const ERR_COMMAND_WARNING = '**Command warning:** %s\n\n%s\n'; // warning reason, full warning
  const ERR_COMMAND_FAILED_INVALID_FORMAT = util.format('Invalid command format! The command is `%s`', STR_CMD_WG_FULL);
  const ERR_DURING_MSG_SEND = 'ERROR: Error while sending Discord message: %s';

  const wgHelp = function(channel) {
    channel.send('', {
      embed: {
        title: STR_CMD_HELP_TITLE,
        description: STR_CMD_WG_FULL,
        color: COLOR_CMD
      }
    });
  };

  // ----- chat commands -----
  client.on('message', (msg) => {
    let msgContent = msg.content;

    if(msgContent.startsWith(STR_CMD_HELP)) {
      console.log(`Got message:\n\t${msgContent}`);
      wgHelp(msg.channel);
    } else if(msgContent.startsWith(STR_CMD_WG_PREFIX)) {
      console.log(`Got message:\n\t${msgContent}`);
      let channel = msg.channel;
      let msgArray = msgContent.split(' '); // split by space
      let region = msgArray[0].substring(STR_CMD_WG_PREFIX.length);
      switch(region) {
      case STR_REGION_NA:
      case STR_REGION_EU:
      case STR_REGION_ASIA:
      case STR_REGION_RU:
        break;
      default:
        return;
      }

      console.log(util.format(CON_CHAT_COMMAND), msgContent);
      if(msgArray.length < CMD_WGSTATS_ARGS_MIN) { // missing args
        channel.send('', {
          embed: {
            title: ERR_COMMAND_FAILED,
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
      wgApi.searchPlayerId(playerName, region)
        .then((tmpPlayerId) => { // get player ID from name
          playerId = tmpPlayerId;
          return wgApi.searchShipId(shipName, region);
        })
        .then((tmpShipIdResult) => { // get ship ID from name
          shipId = tmpShipIdResult.id;
          actualShipName = tmpShipIdResult.name;
          searchShipIdMsg = tmpShipIdResult.message;
          return wgApi.stats(playerId, shipId, region);
        })
        .then((stats) => { // get actual stats
          let statsMsg = utilsStats.formatStats(playerName, actualShipName, stats);
          if(searchShipIdMsg !== '') { // warning
            statsMsg = util.format(ERR_COMMAND_WARNING, searchShipIdMsg, statsMsg);
          }

          channel.send('', {
            embed: {
              title: MSG_STATS_RESULT,
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

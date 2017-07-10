/*
 * File name: wows_bot.js
 * Description: Listens for new WowS matches and checks the stats of WoWS players.
 */

const Promise = require('bluebird');
const wgApi = require('./wg_api.js')();
const utilsStats = require('./utils_stats.js')();
let replayMonitor;

// contains the Discord bot
// require() this and pass in the discord.js logged in client
module.exports = function(client) {
  let module = {};
  let wowsChannel; // the discord channel to send messages in, used by discord.js

  // common/error strings
  const LOG_CHAT_COMMAND = '\nChat command: ';
  const COMMAND_WGSTATS = '!wgstats';
  const COMMAND_WGSTATS_ARGS = '[user] [ship]';
  const ERROR_DEFAULT_WOWS_CHANNEL_NOT_SET = 'DEFAULT_WOWS_CHANNEL was not set!';
  const ERROR_COMMAND_FAILED = '**Command failed:** ';
  const ERROR_COMMAND_WARNING = '**Command warning:** ';
  const ERROR_COMMAND_FAILED_INVALID_FORMAT ='**Command failed:** Invalid command format!\nThe command is `';
  const ERROR_COMMAND_FAILED_INVALID_FORMAT_END = '`.';

  // inits the vars
  function initBot() {
    client.user.setPresence({
      'status': 'online',
      'afk': false,
      'game': {
        'name': COMMAND_WGSTATS + ' ' + COMMAND_WGSTATS_ARGS
      }
    });

    // make sure discord channel was set 
    if(process.env.DEFAULT_WOWS_CHANNEL === undefined || process.env.DEFAULT_WOWS_CHANNEL === '') {
      throw new Error(ERROR_DEFAULT_WOWS_CHANNEL_NOT_SET);
    }
    wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);
    replayMonitor = require('./replay_monitor.js')(wowsChannel);
  }
  initBot();

  // ----- chat commands -----
  client.on('message', (msg) => {
    let msgContent = msg.content;

    // !wgstats [account name] [ship name] will query stats for that player and ship
    if(msgContent.substring(0, 8) === COMMAND_WGSTATS) {
      console.log(LOG_CHAT_COMMAND + msgContent);

      let channel = msg.channel;
      let msgArray = msgContent.split(' ');

      if(msgArray.length < 3) { // missing args
        channel.send(ERROR_COMMAND_FAILED_INVALID_FORMAT +
            COMMAND_WGSTATS + ' ' + COMMAND_WGSTATS_ARGS +
            ERROR_COMMAND_FAILED_INVALID_FORMAT_END);
        return;
      }

      let playerName = msgArray[1];
      let shipName = '';
      for(let msgIndex = 2; msgIndex < msgArray.length; msgIndex++) {
        shipName += msgArray[msgIndex];
        if(msgIndex !== msgArray.length - 1) {
          shipName += ' ';
        }
      }

      let playerId;
      let shipId;
      let actualName;
      let searchMessage;
      wgApi.searchPlayerId(playerName)
        .then((tmpPlayerId) => {
          playerId = tmpPlayerId;
          return wgApi.searchShipId(shipName);
        })
        .then((tmpShipIdResult) => {
          shipId = tmpShipIdResult.id;
          actualName = tmpShipIdResult.name;
          searchMessage = tmpShipIdResult.message;
          return wgApi.stats(playerId, shipId);
        })
        .then((stats) => {
          let msg = utilsStats.formatStats(stats, playerName, actualName);
          let completeMsg = msg;
          if(searchMessage !== '') { // warning
            completeMsg = ERROR_COMMAND_WARNING + searchMessage + '\n' + completeMsg;
          } else {
            completeMsg = '.\n' + completeMsg;
          }
          
          channel.send(completeMsg);
          return;
        })
        .catch((rejectReason) => {
          channel.send(ERROR_COMMAND_FAILED + rejectReason);
          return;
        });

      return;
    }

    return;
  });

  return module;
};

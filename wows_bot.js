/*
 * File name: wows_bot.js
 * Description: Listens for new WowS matches and checks the stats of WoWS players.
 */

let Promise = require('bluebird');
let wgApi = require('./wg_api.js')();
let replayMonitor;
let utilsStats = require('./utils_stats.js')();

// contains the Discord bot
// require() this and pass in the discord.js logged in client
module.exports = function(client) {
  let module = {};
  let wowsChannel; // the discord channel to send messages in, used by discord.js

  // inits the vars
  function initBot() {
    client.user.setPresence({
      'status': 'online',
      'afk': false,
      'game': {
        'name': '!wgstats [user] [ship]'
      }
    });

    // make sure discord channel was set 
    if(process.env.DEFAULT_WOWS_CHANNEL === undefined || process.env.DEFAULT_WOWS_CHANNEL === '') {
      throw new Error('DEFAULT_WOWS_CHANNEL was not set!');
    }
    wowsChannel = client.channels.find('name', process.env.DEFAULT_WOWS_CHANNEL);
    // replayMonitor = require('./replay_monitor.js')(wowsChannel); TODO: hanging WoWS load
  }
  initBot();

  // ----- chat commands -----

  // !wgstats [account name] [ship name] will query stats for that player and ship
  client.on('message', (msg) => {
    let msgContent = msg.content;
    if(msgContent.substring(0, 8) !== '!wgstats') {
      return;
    }

    let channel = msg.channel;
    let msgArray = msgContent.split(' ');

    if(msgArray.length < 3) { // missing args
      channel.send('**Command failed:** Invalid command format!\n' + 
          'The command is `!wgstats [account name] [ship name]`.');
      return;
    }

    let playerId;
    let playerName = msgArray[1];
    let shipId;
    let shipName = '';
    for(let msgIndex = 2; msgIndex < msgArray.length; msgIndex++) {
      shipName += msgArray[msgIndex];
      if(msgIndex !== msgArray.length - 1) {
        shipName += ' ';
      }
    }

    let actualName;
    wgApi.wgSearchPlayerId(playerName)
      .then((tmpPlayerId) => {
        playerId = tmpPlayerId;
        return wgApi.wgSearchShipId(shipName);
      })
      .then((tmpShipIdResult) => {
        shipId = tmpShipIdResult.id;
        actualName = tmpShipIdResult.name;
        return wgApi.wgStats(playerId, shipId);
      })
      .then((stats) => {
        let msg = utilsStats.formatStats(stats, playerName, actualName);
        channel.send(msg);
        return;
      })
      .catch((rejectReason) => {
        channel.send('**Command failed:** ' + rejectReason);
        return;
      });
  });

  return module;
};

/*
 * File name: wows_bot.js
 * Description: Listens for new WowS matches and checks the stats of WoWS players.
 */

let Promise = require('bluebird');
let wgApi = require('./wg_api.js')();
let replayMonitor;

// contains the Discord bot
// require this and pass in the discord.js logged in client
module.exports = function(client) {
  let wowsChannel; // the discord channel to send messages in, used by discord.js

  // format stats into something readable
  function formatStats(stats, playerName, shipName) {
    if(typeof stats === 'string') { // hidden or some kind of error
      return '**' + playerName + '**: *' + shipName + '*\n' + stats;
    } else { // JSON
      let msg = '**' + playerName + '**: *' + shipName + '*\n' +
                'Battles: ' + stats.totalBattles + '\n' +
                'Win Rate: ' + stats.winRate.toFixed(2) + '%\n' +
                'Average XP: ' + stats.avgXp.toFixed(0) + '\n' +
                'Average Damage: ' + stats.avgDmg.toFixed(0) + '\n' +
                'Survival Rate: ' + stats.survivalRate.toFixed(2) + '%\n' +
                'Average Plane Kills: ' + stats.avgPlaneKills.toFixed(2) + '\n' +
                'Average Kills: ' + stats.avgKills.toFixed(2) + '\n';
      if(typeof stats.kd === 'string') {
        msg += 'KD: ' + stats.kd + '\n';
      } else {
        msg += 'KD: ' + stats.kd.toFixed(2) + '\n';
      }

      return msg;
    }
  };

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

    wgApi.wgSearchPlayerId(playerName)
      .then((tmpPlayerId) => {
        playerId = tmpPlayerId;
        return wgApi.wgSearchShipId(shipName);
      })
      .then((tmpShipId) => {
        shipId = tmpShipId;
        return wgApi.wgStats(playerId, shipId);
      })
      .then((stats) => {
        let msg = formatStats(stats, playerName, shipName);
        channel.send(msg);
        return;
      })
      .catch((rejectReason) => {
        channel.send('**Command failed:** ' + rejectReason);
        return;
      });
  });
};

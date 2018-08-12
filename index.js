/*
 * File name: index.js
 * Description: Main file for this bot.
 */

require('dotenv').config();
const Discord = require('discord.js');
const client = new Discord.Client();
const util = require('util');

// console strings
const CON_LOGGED_IN = '\n----------\n' +
                      'Logged in as:\n' +
                      '%s#%s\n' + // username, discriminator
                      '%s\n' + // id
                      '----------\n';

// error strings
const ERR_DISCORD_TOKEN_NOT_SET = 'DISCORD_TOKEN was not set!';

// login with token from .env
if(process.env.DISCORD_TOKEN === undefined || process.env.DISCORD_TOKEN === '') {
  throw new Error(ERR_DISCORD_TOKEN_NOT_SET);
}

client.login(process.env.DISCORD_TOKEN);


// log the logged in account
client.on('ready', () => {
  console.log(util.format(CON_LOGGED_IN, client.user.username, client.user.discriminator, client.user.id));
  client.user.setPresence({
    'status': 'online',
    'afk': false,
    'game': {
      'name': '!help'
    }
  });

  // load in wows_bot
  const wows_bot = require('./wows_bot.js')(client);
});

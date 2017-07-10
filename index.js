/*
 * File name: index.js
 * Description: Main file for this bot.
 */

require('dotenv').config();
const Discord = require('discord.js');
const client = new Discord.Client();

// common/error strings
const ERROR_DISCORD_TOKEN_NOT_SET = 'DISCORD_TOKEN was not set!';

// log the logged in account
client.on('ready', () => {
  console.log('\n----------');
  console.log('Logged in as:');
  console.log(client.user.username + '#' + client.user.discriminator);
  console.log(client.user.id);
  console.log('----------\n');
  console.log('I am ready!\n');

  // load in wows_bot
  const wows_bot = require('./wows_bot.js')(client);
});

// login with token from .env
if(process.env.DISCORD_TOKEN === undefined || process.env.DISCORD_TOKEN === '') {
  throw new Error(ERROR_DISCORD_TOKEN_NOT_SET);
}
client.login(process.env.DISCORD_TOKEN);

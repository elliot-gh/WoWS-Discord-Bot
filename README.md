# WoWS-Match-Stats-Discord-Bot

A Discord bot built on [discord.js](https://discord.js.org/) that loads up stats for the players in the current World of Warships match the host is in.

## Planned Features
* A seperate listener and bot so that any Discord member can have their stats printed in the channel.
* Region detection based on set roles.
* Support other APIs, such as [Warships.Today](https://warships.today/).

## Setup
1. Download [Node.js](https://nodejs.org/). This has developed and tested on v6.10.3 LTS.
2. Download this repository as a zip, and extract somewhere.
3. Fill in the .env file with your information. Check the [.env Configuration](#env-configuration) section for more details.
4. In a terminal in the directory of the extracted folder, simply start the bot with `node index.js`.
5. To stop the bot at any time, press `Ctrl+C` in the terminal window.

## .env Configuration
### <a name="env-configuration"></a>
Quotes, starting with the pound sign(#), are ignored lines.
* `DEFAULT_WOWS_CHANNEL`: The channel your bot will send stat messages in. Omit the pound sign.
* `DISCORD_TOKEN`: A Discord bot token used by your bot to login. Get one from [here](https://discordapp.com/developers/applications/).
* `WG_API_ID`: The API ID used by your bot to use the WGI API. Get one from [here](https://developers.wargaming.net/applications/).
* `WG_MAX_REQUESTS`: The max amount of requests per second your bot is allowed to issue. If you don't know what it should be, leave it at 10. More detail about this limit is [here](https://developers.wargaming.net/documentation/guide/principles/).
* `WOWS_REGION`: The server region you play in for World of Warships. Valid options are `na`, `eu`, `ru`, or `asia`.
* `WOWS_REPLAY_FOLDER`: The directory to your World of Warships replay folder. Replays are disabled by default. To enable them, follow the instructions [here](https://na.wargaming.net/support/kb/articles/517). Make sure you leave a slash at the end of the path. (For example, `/mnt/c/Games/World_of_Warships/replays/`).

## Known Bugs
* The replay watcher and monitor will hang World of Warships when entering a match. Until I can figure out why this happens, this functionality is disabled.
* On rare occasions, the stats returned will be filled with 0s/NaNs/infs. I'm not aware what causes this bug yet, as I personally have not encountered it live (but other people on my Discord server have). I've tried to implement a fix, but it is untested.

## Credits
* [Andrei Mackenzie's Levenshtein distance algorithm (MIT License)](https://gist.github.com/andrei-m/982927)

Node.js Libraries:
* [bluebird](http://bluebirdjs.com/)
* [bottleneck](https://github.com/SGrondin/bottleneck)
* [chokidar](https://github.com/paulmillr/chokidar)
* [discord.js](https://discord.js.org/)
* [dotenv](https://github.com/motdotla/dotenv)
* [request](https://github.com/request/request)

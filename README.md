# WoWS-Match-Stats-Discord-Bot

A Discord bot built on [discord.js](https://discord.js.org/) that loads up stats for the players in the current World of Warships match the host is in.

This is currently under active development.

## Planned Features
* A seperate client side match listener and server hosted bot so that any Discord member can have their stats printed in the channel.
* Region detection based on set roles.
* Support other APIs, such as [Warships.Today](https://warships.today/).
* Load PvE/PvP stats depending on current game mode.

## Setup
1. Download [Node.js](https://nodejs.org/). This has been developed and tested on v6.11.0 LTS. Non LTS versions are not guaranteed to work.
2. Download this repository as a zip, and extract somewhere.
3. Fill in the .env file with your information. Check the [.env Configuration](#env-configuration) section for more details.
4. In a terminal in the directory of the extracted folder, simply start the bot with `npm start`.
5. To stop the bot at any time, press `Ctrl+C` in the terminal window.

## .env Configuration
### <a name="env-configuration"></a>
Simply type the value indicated after the equals sign in the `.env` file.
Comments, starting with the pound sign `#`, are ignored.
* `DEFAULT_WOWS_CHANNEL`: The channel your bot will send stat messages in. Omit the pound sign.
* `DISCORD_TOKEN`: A Discord bot token used by your bot to login. Get one from [here](https://discordapp.com/developers/applications/).
* `REPLAY_MONITOR_ON`: Whether to process matches you enter and load stat messages for every player. Set it to "true" if you want it on, or "false" if you don't (such as wanting to use this bot just for the chat command).
* `WG_API_ID`: The API ID used by your bot to use the WGI API. Get one from [here](https://developers.wargaming.net/applications/).
* `WG_MAX_REQUESTS`: The max amount of requests per second your bot is allowed to issue. If you don't know what it should be, leave it at 10. More detail about this limit is [here](https://developers.wargaming.net/documentation/guide/principles/).
* `WOWS_REGION`: The server region you play in for World of Warships. Valid options are `na`, `eu`, `ru`, or `asia`.
* `WOWS_REPLAY_FOLDER`: The directory to your World of Warships replay folder. Replays are disabled by default. To enable them, follow the instructions [here](https://na.wargaming.net/support/kb/articles/517). Make sure you leave a slash at the end of the path. (For example, `/mnt/c/Games/World_of_Warships/replays/`).

## Known Bugs
* The replay watcher and monitor will hang World of Warships when entering a match. This seems to only be happening on Windows Subsystem for Linux on DrvFs at the moment. [I've opened an issue to check if the problem causing this is intended behavior.](https://github.com/Microsoft/BashOnWindows/issues/2300)

## Credits
* [Andrei Mackenzie's Levenshtein distance algorithm (MIT License)](https://gist.github.com/andrei-m/982927)
* Wargaming for making World of Warships!

Node.js Libraries:
* [bottleneck (MIT License)](https://github.com/SGrondin/bottleneck)
* [chokidar (MIT License)](https://github.com/paulmillr/chokidar)
* [discord.js (Apache License 2.0)](https://discord.js.org/)
* [dotenv (BSD 2-clause License)](https://github.com/motdotla/dotenv)
* [jshint (MIT License + JSON License)](https://github.com/jshint/jshint)
* [request (Apache License 2.0)](https://github.com/request/request)

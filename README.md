# WoWS-Discord-Bot

A Discord bot built on [discord.js](https://discord.js.org/) that loads up stats for players.

This is currently no longer under active development.

## Planned Features

* Rewrite to switch to async/await functions and Bottleneck v2.
* Cache ship names to ID so lookup is faster.
* Properly capitalize ship names for the user so it doesn't keep triggering a typo message.
* Support other APIs, such as [Warships.Today](https://warships.today/).

## Setup

1. Install [Node.js](https://nodejs.org/). This has been developed and tested on v10.8.0 on Windows and Ubuntu, but should work on any platform that Node.js runs on.
2. Pull or download this repository.
3. Fill in the .env file with your information. Check the [.env Configuration](#env-configuration) section for more details.
4. In a terminal in the directory of the extracted folder, simply start the bot with `npm start`.
5. To stop the bot at any time, press `Ctrl+C` in the terminal window.

## .env Configuration

This bot supports either system environment variables or using the `.env` file.
System environment variables will be used over the `.env` file.

To use the `.env` file, simply type the value indicated after the equals sign in the `.env` file.
Comments starting with the pound sign `#` are ignored.

* `DISCORD_TOKEN`: A Discord bot token used by your bot to login. Get one from [here](https://discordapp.com/developers/applications/).
* `WG_API_ID`: The API ID used by your bot to use the WGI API. Get one from [here](https://developers.wargaming.net/applications/).
* `WG_MAX_REQUESTS`: The max amount of requests per second your bot is allowed to issue. If you don't know what it should be, leave it at 10. More detail about this limit is [here](https://developers.wargaming.net/documentation/guide/principles/).

## Known Bugs

* Not necessarily a bug, but with the algorithm I'm using to correct ship typos, occasionally some typos will not seemingly correct to its intended name. For example, "Gaede" resolves to "Medea" instead of "Ernst Gaede".

## Credits

This repository is licensed under the GNU GPL v3.0.

* [Andrei Mackenzie's Levenshtein distance algorithm (MIT License)](https://gist.github.com/andrei-m/982927)
* Wargaming for making World of Warships!

Node.js Libraries:

* [bottleneck (MIT License)](https://github.com/SGrondin/bottleneck)
* [discord.js (Apache License 2.0)](https://discord.js.org/)
* [dotenv (BSD 2-clause License)](https://github.com/motdotla/dotenv)
* [eslint (MIT License)](https://www.npmjs.com/package/eslint)
* [request (Apache License 2.0)](https://github.com/request/request)

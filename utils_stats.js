/**
 * File name: utils_stats.js
 * Description: Contains utilites for formatting stats.
 */

const util = require('util');

// contains utilites functions for formatting stats
// just require() this
module.exports = function() {
  let module = {}; // this module 

  // message strings
  const MSG_NO_STATS = '**%s**: *%s*\n%s'; // player name, ship name, actual message
  const MSG_STATS_FORMAT = '**%s**: *%s*\n' + // player name, ship name
                           'Battles: %d\n' + // num of battles
                           'Win Rate: %d%%\n' + // win rate in percentage
                           'Average XP: %d\n' + // average xp
                           'Average Damage: %d\n' + // average damage
                           'Survival Rate: %d%%\n' + // survival rate in percentage
                           'Average Plane Kills: %d\n' + // average plane kills
                           'Average Kills: %d\n'; // average kills
  const MSG_KD_FORMAT    = 'KD: %s\n'; // KD ratio

  // format stats into something readable
  module.formatStats = function(playerName, shipName, stats) {
    if(typeof stats === 'string') { // hidden or some kind of error
      return util.format(MSG_NO_STATS, playerName, shipName, stats);
    } else { // stats in JSON
      let msg = util.format(MSG_STATS_FORMAT, playerName, shipName,
                            stats.totalBattles,
                            stats.winRate.toFixed(2),
                            stats.avgXp.toFixed(0),
                            stats.avgDmg.toFixed(0),
                            stats.survivalRate.toFixed(2),
                            stats.avgPlaneKills.toFixed(2),
                            stats.avgKills.toFixed(2));
      if(typeof stats.kd === 'string') { // checking inf KD
        msg += util.format(MSG_KD_FORMAT, stats.kd);
      } else {
        msg += util.format(MSG_KD_FORMAT, stats.kd.toFixed(2));
      }

      return msg;
    }
  };

  // calculates Levenshtein distance
  // this implementation was copied from Andrei Mackenzie under the MIT License;
  // only stylistic elements were changed.
  // working link as of this commit: https://gist.github.com/andrei-m/982927
  module.levenshteinDistance = function(input, actual) {
    if(input.length === 0) {
      return actual.length; 
    }
    if(actual.length === 0) {
      return input.length; 
    }
    if(input === actual) {
      return 0;
    }

    let matrix = [];

    // increment along the first column of each row
    let actualIndex;
    for(actualIndex = 0; actualIndex <= actual.length; actualIndex++) {
      matrix[actualIndex] = [actualIndex];
    }

    // increment each column in the first row
    let inputIndex;
    for(inputIndex = 0; inputIndex <= input.length; inputIndex++) {
      matrix[0][inputIndex] = inputIndex;
    }

    // fill in the rest of the matrix
    for(actualIndex = 1; actualIndex <= actual.length; actualIndex++) {
      for(inputIndex = 1; inputIndex <= input.length; inputIndex++) {
        if(actual.charAt(actualIndex - 1) === input.charAt(inputIndex - 1)) {
          matrix[actualIndex][inputIndex] = matrix[actualIndex - 1][inputIndex - 1];
        } else {
          matrix[actualIndex][inputIndex] =
              Math.min(matrix[actualIndex - 1][inputIndex - 1] + 1, // substitution
              Math.min(matrix[actualIndex][inputIndex - 1] + 1, // insertion
              matrix[actualIndex - 1][inputIndex] + 1)); // deletion
        }
      }
    }

    return matrix[actual.length][input.length];
  };

  // used for array sorting
  module.caseInsensitiveCompare = function(string1, string2) {
    var s1lower = string1.toLowerCase();
    var s2lower = string2.toLowerCase();

    if(s1lower < s2lower) {
      return -1;
    } else if(s1lower > s2lower) {
      return 1;
    } else {
      return 0;
    }
  };

  return module;
};

/**
 * File name: utils_stats.js
 * Description: Contains utilites for formatting stats.
 */

// contains utilites functions for formatting stats
// just require() this
module.exports = function() {
  let module = {};

  // format stats into something readable
  module.formatStats = function(stats, playerName, shipName) {
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

  // calculates Levenshtein distance
  // most of this implementation copied from Andrei Mackenzie under the MIT License.
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

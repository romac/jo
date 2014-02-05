
'use strict';

module.exports = function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
};

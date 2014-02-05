
'use strict';

module.exports = (function() {
  if (typeof process === 'object' && typeof process.nextTick === 'function') {
    return process.nextTick.bind(process);
  }

  if (typeof setImmediate === 'function') {
    return setImmediate;
  }

  return function(fn) {
    setTimeout(fn, 0);
  };
})();

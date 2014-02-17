
'use strict';

var rbTree = require('functional-red-black-tree'),
    dispatch = require('./dispatch'),
    chan = require('./chan');

module.exports = {
  timeout: timeout,
  after: after
};

var timeoutsMap = rbTree();

var TIMEOUT_RESOLUTION_MS = 10;

function timeout(ms) {
  return after(ms);
}

function after(ms, value) {
  var to = (new Date()).valueOf() + ms,
      me = timeoutsMap.ge(to);

  if (me && me.key < (to + TIMEOUT_RESOLUTION_MS)) {
    return me.val;
  }

  var timeoutChannel = chan(null);
  timeoutsMap = timeoutsMap.insert(to, timeoutChannel);

  dispatch.queueDelay(function() {
    timeoutsMap = timeoutsMap.remove(to);
    if (typeof value !== 'undefined') {
      timeoutChannel.put(value);
    }
    timeoutChannel.close();
  }, ms);

  return timeoutChannel;
}

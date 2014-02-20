
'use strict';

var rbTree = require('functional-red-black-tree'),
    dispatch = require('./dispatch'),
    chan = require('./chan');

module.exports = {
  timeout: timeout
};

var timeoutsMap = rbTree();

var TIMEOUT_RESOLUTION_MS = 10;

function timeout(ms) {
  var to = (new Date()).valueOf() + ms,
      me = timeoutsMap.ge(to);

  if (me && me.key < (to + TIMEOUT_RESOLUTION_MS)) {
    return me.value;
  }

  var timeoutChannel = chan(null);
  timeoutsMap = timeoutsMap.insert(to, timeoutChannel);

  dispatch.queueDelay(function() {
    timeoutsMap = timeoutsMap.remove(to);
    timeoutChannel.close();
  }, ms);

  return timeoutChannel;
}

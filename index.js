
'use strict';

var chan = require('./lib/chan'),
    timers = require('./lib/timers'),
    coro = require('./lib/coroutines');

module.exports = {
  chan: chan,
  go: coro.go,
  take: coro.take,
  put: coro.put,
  wait: coro.wait,
  defer: coro.defer,
  select: coro.select,
  timeout: timers.timeout
};

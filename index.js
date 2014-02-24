
'use strict';

var chan = require('./lib/chan'),
    timers = require('./lib/timers'),
    coro = require('./lib/coroutines'),
    comb = require('./lib/combinators'),
    events = require('./lib/events');

module.exports = {
  chan: chan,
  go: coro.go,
  take: coro.take,
  put: coro.put,
  wait: coro.wait,
  await: coro.await,
  alts: coro.alts,
  collect: coro.collect,
  timeout: timers.timeout,
  map: comb.map,
  remove: comb.remove,
  filter: comb.filter,
  mapcat: comb.mapcat,
  split: comb.split,
  reduce: comb.reduce,
  toChan: comb.toChan,
  into: comb.into,
  listen: events.listen,
  on: events.on
};

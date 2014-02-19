
'use strict';

var chan = require('./lib/chan'),
    timers = require('./lib/timers'),
    coro = require('./lib/coroutines'),
    comb = require('./lib/combinators');

module.exports = {
  chan: chan,
  go: coro.go,
  take: coro.take,
  put: coro.put,
  wait: coro.wait,
  await: coro.await,
  select: coro.select,
  collect: coro.collect,
  timeout: timers.timeout,
  after: timers.after,
  map: comb.map,
  remove: comb.remove,
  filter: comb.filter,
  mapcat: comb.mapcat,
  split: comb.split,
  partition: comb.partition,
  reduce: comb.reduce,
  toChan: comb.toChan
};

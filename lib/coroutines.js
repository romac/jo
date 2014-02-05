
'use strict';

var chan = require('./chan'),
    handler = require('./handler'),
    dispatcher = require('./dispatch');

module.exports = {
  go: go,
  put: put,
  take: take
};

var nop = handler(function() {});

function Instruction(state, value) {
  this.state = state;
  this.value = value;
}

// http://swannodette.github.io/2013/08/24/es6-generators-and-csp/
function go(coro) {
  var done = chan(1);

  dispatcher.run(function() {
    var gen = coro();
    _go(gen, gen.next(), chan);
  });

  return done;
}

function _go(coro, step, done) {
  while (!step.done) {
    var instr = step.value();

    switch (instr.state) {
      case 'park':
        dispatcher.run(function() {
          _go(coro, step);
        });
        return;

      case 'continue':
        step = coro.next(instr.value);
        break;
    }
  }

  put(done, true);
}

function put(chan, value) {
  return function() {
    if (chan.isFull()) {
      return new Instruction('park', null);
    }

    chan._put(value, nop);

    return new Instruction('continue', null);
  };
}

function take(chan) {
  return function() {
    if (!chan.hasOne()) {
      return new Instruction('park', null);
    }

    var ret = chan._take(nop);

    return new Instruction('continue', ret.deref());
  };
}

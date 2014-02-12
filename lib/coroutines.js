
'use strict';

var chan = require('./chan'),
    handler = require('./handler'),
    dispatcher = require('./dispatch');

module.exports = {
  go: go,
  put: put,
  take: take
};

function Coroutine(gen, doneChan) {
  this.gen = gen;
  this.step = gen.next();
  this.done = false;
  this.doneChan = doneChan;
}

Coroutine.prototype = {
  run: function() {
    if (this.step.done) {
      put(this.doneChan, true);
      this.done = true;

      return;
    }

    var op = this.step.value;
    op(this);
  },

  park: function() {
    this.spin();
  },

  resume: function(value) {
    if (!this.step.done) {
      this.step = this.gen.next(value);
    }
    this.spin();
  },

  spin: function() {
    dispatcher.run(this.run.bind(this));
  }
};

// http://swannodette.github.io/2013/08/24/es6-generators-and-csp/
function go(fn) {
  var done = chan(1);

  dispatcher.run(function() {
    var coro = new Coroutine(fn(), done);
    coro.run();
  });

  return done;
}

function put(chan, value) {
  return function(coro) {
    var ret = chan._put(value, handler(function() {
      coro.resume();
    }));

    if (ret != null) {
      coro.resume();
    }
    else {
      coro.park();
    }
  };
}

function take(chan) {
  return function(coro) {
    var ret = chan._take(handler(function(value) {
      coro.resume(value);
    }));

    if (ret != null) {
      coro.resume(ret.deref());
    }
    else {
      coro.park();
    }
  };
}

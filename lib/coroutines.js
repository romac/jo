
'use strict';

var chan = require('./chan'),
    dispatcher = require('./dispatch');

module.exports = {
  go: go,
  put: put,
  take: take,
  defer: defer,
  wait: wait,
  coro: coro,
  select: select,
  Coroutine: Coroutine
};

function Coroutine(gen, doneChan) {
  this.gen = gen;
  this.step = gen.next();
  this.done = false;
  this.doneChan = doneChan;
}

Coroutine.prototype = {
  run: function() {
    if (this.done) {
      return;
    }

    if (this.step.done) {
      put(this.doneChan, this.step.value);
      this.doneChan.close();
      this.done = true;
      return;
    }

    var op = this.step.value;
    op(this);
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

function coro(fn, doneChan) {
  return new Coroutine(fn, doneChan);
}

// http://swannodette.github.io/2013/08/24/es6-generators-and-csp/
function go(fn) {
  var done = chan(1);

  dispatcher.run(function() {
    coro(fn(), done).run();
  });

  return done;
}

var slice = Array.prototype.slice;

function defer(fn /*, ...args */) {
  var args = slice.call(arguments, 1);
  return function(coro) {
    args.push(function() {
      coro.resume(slice.call(arguments));
    });

    fn.apply(null, args);
  };
}

function wait(ms) {
  return function(coro) {
    setTimeout(function() {
      coro.resume();
    }, ms);
  };
}

function put(chan, value) {
  return function(coro) {
    chan.put(value, function() {
      coro.resume();
    });
  };
}

function take(chan) {
  return function(coro) {
    chan.take(function(value) {
      coro.resume(value);
    });
  };
}

function select(chans) {
  return function(coro) {
    var done = false;
    for (var i = 0; i < chans.length; i += 1) {
      var chan = chans[i];
      chan.take((function(chan) {
        return function(value) {
          if (!done) {
            done = true;
            coro.resume({chan: chan, value: value});
          }
        };
      })(chan));
    }
  };
}


'use strict';

var chan = require('./chan'),
    dispatcher = require('./dispatch'),
    FlaggedHandler = require('./handler').FlaggedHandler;

module.exports = {
  go: go,
  put: put,
  take: take,
  await: await,
  wait: wait,
  alts: alts,
  select: select,
  collect: collect,
  Coroutine: Coroutine
};

function Coroutine(gen, doneChan) {
  if (!(this instanceof Coroutine)) {
    return new Coroutine(gen, doneChan);
  }

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
      if (this.step.value != null) {
        this.doneChan.put(this.step.value);
      }
      this.doneChan.close();
      this.done = true;
      return;
    }

    var op = this.step.value;
    if (typeof op !== 'function') {
      throw new Error('The yielded operation must return a ' +
                      'function that takes the coroutine as first arguemnt');
    }
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

// http://swannodette.github.io/2013/08/24/es6-generators-and-csp/
function go(fn) {
  var done = chan(1);

  dispatcher.run(function() {
    Coroutine(fn(), done).run();
  });

  return done;
}

var slice = Array.prototype.slice;

function await(fn /*, ...args */) {
  var args = slice.call(arguments, 1);
  return function(coro) {
    args.push(coro.resume.bind(coro));
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

// Based on the Fisher-Yates shuffling algorithm.
// http://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
function randomIndices(n) {
  var a = new Array(n);
  for (var t = 0; t < n; t += 1) {
    a[t] = t;
  }
  for (var i = n - 1; i > 0; i -= 1) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[j];
    a[j] = a[i];
    a[i] = tmp;
  }
  return a;
}

function alts(chans) {
  if (!Array.isArray(chans) || chans.length === 0) {
    throw new Error('chans must be an non-empty array of channels.');
  }

  return function(coro) {
    var done = {value: false},
        indices = randomIndices(chans.length);

    for (var i = 0; i < chans.length; i += 1) {
      var chan = chans[indices[i]];
      var cb = (function(chan) {
        return function(value) {
          coro.resume({value: value, chan: chan});
        };
      })(chan);

      var result = chan._take(new FlaggedHandler(done, cb));

      if (result != null) {
        cb(result.deref());
        return;
      }
    }
  };
}

function select(/* ...clauses */) {
  var clauses = slice.call(arguments);

  if (!Array.isArray(clauses) || clauses.length === 0) {
    throw new Error('chans must be an non-empty array of channels.');
  }

  return function(coro) {
    var done = {value: false},
        indices = randomIndices(clauses.length);

    for (var i = 0; i < clauses.length; i += 1) {
      var clause = clauses[indices[i]];

      if (!Array.isArray(clause) || clause.length === 0) {
        throw new Error('Each clause must match [channel block].');
      }

      var chan = clause[0],
          block = clause[1];

      var cb = (function(chan, block) {
        return function(value) {
          coro.resume(block(value));
        };
      })(chan, block);

      var result = chan._take(new FlaggedHandler(done, cb));

      if (result != null) {
        cb(result.deref());
        return;
      }
    }
  };
}

// FIXME: Trampoline to avoid stack overflows!
function collect(ch) {
  return function(coro) {
    var values = [];

    function loop() {
      ch.take(function(value) {
        if (value === null) {
          coro.resume(values);
        }
        else {
          values.push(value);
          loop();
        }
      });
    }

    loop();
  };
}

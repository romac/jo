(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var wrapGenerator = require('regeneratorify/runtime').wrapGenerator;

// http://swannodette.github.io/2013/07/12/communicating-sequential-processes/

'use strict';

var jo = require('../../..');

var c = jo.chan();

function render(q)
{
  return q.concat().reverse().map(function(p) {
    return '<div class="proc-' + p + '">Process ' + p + '</div>';
  }).join('\n');
}

function loop(interval, num)
{
  return wrapGenerator.mark(function() {
    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 7;
          break;
        }

        $ctx.next = 3;
        return jo.wait(interval);
      case 3:
        $ctx.next = 5;
        return jo.put(c, num);
      case 5:
        $ctx.next = 0;
        break;
      case 7:
      case "end":
        return $ctx.stop();
      }
    }, this);
  })
}

function peekn(v, n)
{
  if (v.length < n) {
    return v;
  }

  return v.slice(v.length - n);
}

jo.go(loop(250,  1));
jo.go(loop(1000, 2));
jo.go(loop(1500, 3));

var $ = document.querySelector.bind(document);
var el = $('#ex');

jo.go(wrapGenerator.mark(function() {
  var q;

  return wrapGenerator(function($ctx) {
    while (1) switch ($ctx.next) {
    case 0:
      q = [];
    case 1:
      if (!true) {
        $ctx.next = 10;
        break;
      }

      el.innerHTML = render(q);
      $ctx.next = 5;
      return jo.take(c);
    case 5:
      $ctx.t0 = $ctx.sent;
      $ctx.t1 = q.concat([$ctx.t0]);
      q = peekn($ctx.t1, 10);
      $ctx.next = 1;
      break;
    case 10:
    case "end":
      return $ctx.stop();
    }
  }, this);
}));

},{"../../..":2,"regeneratorify/runtime":23}],2:[function(require,module,exports){

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
  select: coro.select,
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

},{"./lib/chan":5,"./lib/combinators":6,"./lib/coroutines":7,"./lib/events":9,"./lib/timers":11}],3:[function(require,module,exports){

'use strict';

var assert = require('assert'),
    dispatcher = require('./dispatch'),
    handler = require('./handler'),
    buffers = require('jo-buffers');

module.exports = Channel;

var MAX_DIRTY = 64;
var MAX_QUEUE_SIZE = 1024;

function PutBox(handler, value) {
  this.handler = handler;
  this.value = value;
}

function isPutActive(box) {
  return box.handler.isActive();
}

function call(methodName) {
  return function(obj) {
    return obj[methodName]();
  };
}

function Channel(takes, dirtyTakes, puts, dirtyPuts, buf, closed) {
  this.takes = takes;
  this.dirtyTakes = dirtyTakes;
  this.puts = puts;
  this.dirtyPuts = dirtyPuts;
  this.buf = buf;
  this.closed = closed;
}

Channel.create = function(buf) {
  return new Channel(
    buffers.ring(32),
    0,
    buffers.ring(32),
    0,
    buf,
    null
  );
};

var box = Channel.box = function(val) {
  return {
    deref: function() {
      return val;
    }
  };
};

function nop() {}

Channel.prototype = {

  isBuffered: function() {
    return !!this.buf;
  },

  // TODO: Find a better name
  isFull: function() {
    return this.isBuffered() && this.buf.isFull() || false;
  },

  put: function(value, fn, onCaller) {
    fn = (fn != null) ? fn : nop;
    onCaller = (onCaller != null) ? onCaller : true;

    var ret = this._put(value, handler(fn));

    if (ret == null || fn === nop) {
      return;
    }

    if (onCaller) {
      fn();
    }
    else {
      dispatcher.run(fn);
    }
  },

  _put: function(value, handler) {
    assert.notEqual(value, null, 'Cannot put a null value in a channel');

    if (this.closed || !handler.isActive()) {
      return box(null);
    }

    while (true) {
      var taker = this.takes.pop();

      if (taker != null) {
        if (!taker.isActive()) {
          continue;
        }

        var takeCb = taker.commit();
        handler.commit();

        dispatcher.run(function() {
          takeCb(value);
        });

        return box(null);
      }

      if (this.buf != null && !this.buf.isFull()) {
        handler.commit();
        this.buf.add(value);

        return box(null);
      }

      if (this.dirtyPuts > MAX_DIRTY) {
        this.dirtyPuts = 0;
        this.puts.cleanup(isPutActive);
      }
      else {
        this.dirtyPuts += 1;
      }

      assert(
        this.puts.length < MAX_QUEUE_SIZE,
        'No more than ' + MAX_QUEUE_SIZE +
        ' pending puts are allowed on a single channel.' +
        ' Consider using a windowed buffer.'
      );

      this.puts.unboundedUnshift(new PutBox(handler, value));

      break;
    }

    return null;
  },

  take: function(fn, onCaller) {
    onCaller = (onCaller != null) ? onCaller : true;

    var ret = this._take(handler(fn));

    if (ret == null) {
      return;
    }

    var value = ret.deref();

    if (onCaller) {
      fn(value);
    }
    else {
      dispatcher.run(function() {
        fn(value);
      });
    }
  },

  _take: function(handler) {
    if (!handler.isActive()) {
      return null;
    }

    if (this.buf != null && this.buf.count() > 0) {
      handler.commit();
      return box(this.buf.remove());
    }

    while (true) {
      var putter = this.puts.pop();

      if (putter != null) {
        if (!putter.handler.isActive()) {
          continue;
        }

        var putCb = putter.handler.commit();
        handler.commit();
        dispatcher.run(putCb);

        return box(putter.value);
      }

      if (this.closed) {
        handler.commit();
        return box(null);
      }

      if (this.dirtyTakes > MAX_DIRTY) {
        this.dirtyTakes = 0;
        this.takes.cleanup(call('isActive'));
      }
      else {
        this.dirtyTakes += 1;
      }

      assert(
        this.takes.length < MAX_QUEUE_SIZE,
        'No more than ' + MAX_QUEUE_SIZE +
        ' pending takes are allowed on a single channel.'
      );

      this.takes.unboundedUnshift(handler);

      break;
    }

    return null;
  },

  isClosed: function() {
    return this.closed;
  },

  close: function() {
    if (this.isClosed()) {
      return;
    }

    this.closed = true;

    while (true) {
      var taker = this.takes.pop();

      if (taker == null) {
        return;
      }

      if (!taker.isActive()) {
        continue;
      }

      var takeCb = taker.commit();
      dispatcher.run(function() {
        takeCb(null);
      });

      break;
    }
  }
};

},{"./dispatch":8,"./handler":10,"assert":24,"jo-buffers":13}],4:[function(require,module,exports){

'use strict';

var util = require('util'),
    Channel = require('./Channel'),
    assert = require('assert');

// FIXME: Overriding a method that calls another method requires
//        to override both methods, which is really annoying
//        as it leads to code duplication.
//        Not sure whether it's possible to avoid that.
function ChannelProxy(source) {
  assert(source instanceof Channel, 'ch must be a Channel');

  this._source = source;

  this.isBuffered = source.isBuffered.bind(source);
  this.isFull = source.isFull.bind(source);
  this.put = source.put.bind(source);
  this._put = source._put.bind(source);
  this.take = source.take.bind(source);
  this._take = source._take.bind(source);
  this.close = source.close.bind(source);
}

util.inherits(ChannelProxy, Channel);

module.exports = ChannelProxy;

},{"./Channel":3,"assert":24,"util":28}],5:[function(require,module,exports){

'use strict';

var Channel = require('./Channel'),
    buffers = require('jo-buffers');

module.exports = function chan(bufOrN) {
  if (!bufOrN) {
    return Channel.create(null);
  }

  var buf = typeof bufOrN === 'number' ? buffers.default(bufOrN) : bufOrN;

  return Channel.create(buf);
};

},{"./Channel":3,"jo-buffers":13}],6:[function(require,module,exports){
var wrapGenerator = require('regeneratorify/runtime').wrapGenerator;

'use strict';

var co = require('./coroutines'),
    assert = require('assert'),
    chan = require('./chan'),
    Channel = require('./Channel'),
    ChannelProxy = require('./ChannelProxy'),
    assert = require('assert'),
    handler = require('./handler'),
    Handler = handler.Handler,
    dispatcher = require('./dispatch'),
    FixedBuffer = require('jo-buffers').FixedBuffer;

function complement(f) {
  return function(x) {
    return !f(x);
  };
}

var filter = exports.filter = function(p, ch, bufOrN) {
  assert.equals(typeof p, 'function', 'p must be a function');
  assert(ch instanceof Channel, 'ch must be a Channel');

  var out = chan(bufOrN);

  co.go(wrapGenerator.mark(function() {
    var value;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 14;
          break;
        }

        $ctx.next = 3;
        return co.take(ch);
      case 3:
        value = $ctx.sent;

        if (!(value === null)) {
          $ctx.next = 9;
          break;
        }

        out.close();
        delete $ctx.thrown;
        $ctx.next = 14;
        break;
      case 9:
        if (!p(value)) {
          $ctx.next = 12;
          break;
        }

        $ctx.next = 12;
        return co.put(ch, value);
      case 12:
        $ctx.next = 0;
        break;
      case 14:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
};

exports.remove = function(p, ch, bufOrN) {
  return filter(complement(p), ch, bufOrN);
};

function mapHandler(f, h) {
  return new Handler(
    function() { return h.isActive(); },
    function() {
      var f1 = h.commit();
      return function(v) {
        return f1(v === null ? null : f(v));
      };
    }
  );
}

exports.map = function(f, ch) {
  var mapped = new ChannelProxy(ch);

  mapped.take = function(fn, onCaller) {
    onCaller = (onCaller != null) ? onCaller : true;

    var ret = this._take(handler(fn));

    if (ret == null) {
      return;
    }

    var value = ret.deref();

    if (onCaller) {
      fn(value);
    }
    else {
      dispatcher.run(function() {
        fn(value);
      });
    }
  };

  mapped._take = function(h) {
    var ret = this._source._take(mapHandler(f, h));

    if (!ret || ret.deref() === null) {
      return ret;
    }

    return Channel.box(f(ret.deref()));
  };

  return mapped;
};

exports.mapcat = function(f, ch, bufOrN) {
  var out = chan(bufOrN);

  co.go(wrapGenerator.mark(function() {
    var val, coll, p;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 25;
          break;
        }

        $ctx.next = 3;
        return co.take(ch);
      case 3:
        val = $ctx.sent;

        if (!(val === null)) {
          $ctx.next = 9;
          break;
        }

        out.close();
        delete $ctx.thrown;
        $ctx.next = 25;
        break;
      case 9:
        coll = f(val);

        if (!!Array.isArray(coll)) {
          $ctx.next = 12;
          break;
        }

        throw new Error('non-array returned by the given function.');
      case 12:
        $ctx.t2 = $ctx.keys(coll);
      case 13:
        if (!$ctx.t2.length) {
          $ctx.next = 19;
          break;
        }

        p = $ctx.t2.pop();
        $ctx.next = 17;
        return co.put(out, coll[p]);
      case 17:
        $ctx.next = 13;
        break;
      case 19:
        if (!out.isClosed()) {
          $ctx.next = 23;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 25;
        break;
      case 23:
        $ctx.next = 0;
        break;
      case 25:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return out;
};

exports.pipe = function(from, to, close) {
  close = close != null && close || true;

  co.go(wrapGenerator.mark(function() {
    var v, ret;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 18;
          break;
        }

        $ctx.next = 3;
        return co.take(from);
      case 3:
        v = $ctx.sent;

        if (!(v === null)) {
          $ctx.next = 9;
          break;
        }

        if (close) {
          to.close();
        }

        delete $ctx.thrown;
        $ctx.next = 18;
        break;
      case 9:
        $ctx.next = 11;
        return co.put(to, v);
      case 11:
        ret = $ctx.sent;

        if (!(ret == null)) {
          $ctx.next = 16;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 18;
        break;
      case 16:
        $ctx.next = 0;
        break;
      case 18:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
  return to;
};

exports.split = function(p, ch, tBufOrN, fBufOrN) {
  var t = chan(tBufOrN),
      f = chan(fBufOrN);

  co.go(wrapGenerator.mark(function() {
    var v, ret;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        if (!true) {
          $ctx.next = 19;
          break;
        }

        $ctx.next = 3;
        return co.take(ch);
      case 3:
        v = $ctx.sent;

        if (!(v === null)) {
          $ctx.next = 10;
          break;
        }

        t.close();
        f.close();
        delete $ctx.thrown;
        $ctx.next = 19;
        break;
      case 10:
        $ctx.next = 12;
        return co.put(p(v) ? t : f, v);
      case 12:
        ret = $ctx.sent;

        if (!(ret == null)) {
          $ctx.next = 17;
          break;
        }

        delete $ctx.thrown;
        $ctx.next = 19;
        break;
      case 17:
        $ctx.next = 0;
        break;
      case 19:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));

  return [t, f];
};

var reduce = exports.reduce = function(f, init, ch) {
  return co.go(wrapGenerator.mark(function() {
    var ret, v;

    return wrapGenerator(function($ctx) {
      while (1) switch ($ctx.next) {
      case 0:
        ret = init;
      case 1:
        if (!true) {
          $ctx.next = 13;
          break;
        }

        $ctx.next = 4;
        return co.take(ch);
      case 4:
        v = $ctx.sent;

        if (!(v === null)) {
          $ctx.next = 10;
          break;
        }

        $ctx.rval = ret;
        delete $ctx.thrown;
        $ctx.next = 13;
        break;
      case 10:
        ret = f(ret, v);
        $ctx.next = 1;
        break;
      case 13:
      case "end":
        return $ctx.stop();
      }
    }, this);
  }));
};

// FIXME: This is a stub. The channel should close after all elements have been emitted.
exports.toChan = function(coll) {
  return chan(new FixedBuffer(coll.reverse(), coll.length));
};

function conj(coll, x) {
  return coll.concat(x);
}

exports.into = function(coll, ch) {
  return reduce(conj, coll, ch);
};

},{"./Channel":3,"./ChannelProxy":4,"./chan":5,"./coroutines":7,"./dispatch":8,"./handler":10,"assert":24,"jo-buffers":13,"regeneratorify/runtime":23}],7:[function(require,module,exports){
var wrapGenerator = require('regeneratorify/runtime').wrapGenerator;

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

function collect(ch) {
  return function(coro) {
    go(wrapGenerator.mark(function() {
      var values, value;

      return wrapGenerator(function($ctx) {
        while (1) switch ($ctx.next) {
        case 0:
          values = [];
        case 1:
          if (!true) {
            $ctx.next = 15;
            break;
          }

          $ctx.next = 4;
          return take(ch);
        case 4:
          value = $ctx.sent;

          if (!(value === null)) {
            $ctx.next = 12;
            break;
          }

          coro.resume(values);
          delete $ctx.thrown;
          $ctx.next = 15;
          break;
        case 12:
          values.push(value);
        case 13:
          $ctx.next = 1;
          break;
        case 15:
        case "end":
          return $ctx.stop();
        }
      }, this);
    }));
  };
}

},{"./chan":5,"./dispatch":8,"./handler":10,"regeneratorify/runtime":23}],8:[function(require,module,exports){

'use strict';

var buffers = require('jo-buffers'),
    process = require('process');

var TASK_BATCH_SIZE = 1024;

function Dispatcher() {
  this.tasks = buffers.ring(32);
  this.running = false;
  this.queued = false;
  this.messageChannel = null;

  if (typeof MessageChannel !== 'undefined') {
    this.messageChannel = new MessageChannel();
    this.messageChannel.port1.onmessage = function(msg) {
      this.processMessages();
    }.bind(this);
  }
}

Dispatcher.prototype = {

  processMessages: function() {
    this.running = true;
    this.queued = false;

    for (var count = 0; count < TASK_BATCH_SIZE; count += 1) {
      var m = this.tasks.pop();
      if (m == null) {
        break;
      }
      m();
    }

    this.running = false;
    if (this.tasks.length > 0) {
      this.queue();
    }
  },

  queue: function() {
    if (this.queued || this.running) {
      return;
    }

    this.queued = true;

    if (this.messageChannel) {
      this.messageChannel.port2.postMessage(0);
    }
    else {
      process.nextTick(this.processMessages.bind(this));
    }
  },

  queueDelay: function(f, delay) {
    setTimeout(f, delay);
  },

  run: function(f) {
    this.tasks.unboundedUnshift(f);
    this.queue();
  }
};

module.exports = new Dispatcher();
module.exports.Dispatcher = Dispatcher;

},{"jo-buffers":13,"process":22}],9:[function(require,module,exports){

'use strict';

var chan = require('./chan'),
    slice = Array.prototype.slice;

var listen = exports.listen = function(el, evType, bufOrN) {
  var c = chan(bufOrN);

  el.addEventListener(evType, function(e) {
    c.put(e);
  });

  return c;
};

var on = exports.on = function(ee, evType, bufOrN) {
  var c = chan(bufOrN);

  ee.on(evType, function(/* ...args */) {
    c.put(slice.call(arguments));
  });

  return c;
};

var once = exports.once = function(ee, evType) {
  return on(ee, evType, 1);
};

},{"./chan":5}],10:[function(require,module,exports){

'use strict';

var util = require('util');

function fromFunction(f) {
  return new Handler(
    function() {
      return true;
    },
    function() {
      return f;
    }
  );
}

function Handler(isActive, commit) {
  this.isActive = isActive;
  this.commit = commit;
}

function FlaggedHandler(flag, cb) {
  this.flag = flag;
  this.cb = cb;

  Handler.call(
    this,
    function() {
      return !this.flag.value;
    },
    function() {
      this.flag.value = true;
      return this.cb;
    }
  );
}

util.inherits(FlaggedHandler, Handler);

module.exports = fromFunction;
module.exports.Handler = Handler;
module.exports.FlaggedHandler = FlaggedHandler;

},{"util":28}],11:[function(require,module,exports){

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

},{"./chan":5,"./dispatch":8,"functional-red-black-tree":12}],12:[function(require,module,exports){
"use strict"

module.exports = createRBTree

var RED   = 0
var BLACK = 1

function RBNode(color, key, value, left, right, count) {
  this._color = color
  this.key = key
  this.value = value
  this.left = left
  this.right = right
  this._count = count
}

function cloneNode(node) {
  return new RBNode(node._color, node.key, node.value, node.left, node.right, node._count)
}

function repaint(color, node) {
  return new RBNode(color, node.key, node.value, node.left, node.right, node._count)
}

function recount(node) {
  node._count = 1 + (node.left ? node.left._count : 0) + (node.right ? node.right._count : 0)
}

function toJSON(node) {
  var result = { color: node._color ? "black" : "red", key: node.key, value: node.value }
  if(node.left) {
    result.left = toJSON(node.left)
  }
  if(node.right) {
    result.right = toJSON(node.right)
  }
  return result
}

function RedBlackTree(compare, root) {
  this._compare = compare
  this.root = root
}

var proto = RedBlackTree.prototype

Object.defineProperty(proto, "keys", {
  get: function() {
    var result = []
    this.foreach(function(k,v) {
      result.push(k)
    })
    return result
  }
})

Object.defineProperty(proto, "values", {
  get: function() {
    var result = []
    this.foreach(function(k,v) {
      result.push(v)
    })
    return result
  }
})

//Returns the number of nodes in the tree
Object.defineProperty(proto, "length", {
  get: function() {
    if(this.root) {
      return this.root._count
    }
    return 0
  }
})

//Insert a new item into the tree
proto.insert = function(key, value) {
  var cmp = this._compare
  //Find point to insert new node at
  var n = this.root
  var n_stack = []
  var d_stack = []
  while(n) {
    var d = cmp(key, n.key)
    n_stack.push(n)
    d_stack.push(d)
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  //Rebuild path to leaf node
  n_stack.push(new RBNode(RED, key, value, null, null, 1))
  for(var s=n_stack.length-2; s>=0; --s) {
    var n = n_stack[s]
    if(d_stack[s] <= 0) {
      n_stack[s] = new RBNode(n._color, n.key, n.value, n_stack[s+1], n.right, n._count+1)
    } else {
      n_stack[s] = new RBNode(n._color, n.key, n.value, n.left, n_stack[s+1], n._count+1)
    }
  }
  //Rebalance tree using rotations
  //console.log("start insert", key, d_stack)
  for(var s=n_stack.length-1; s>1; --s) {
    var p = n_stack[s-1]
    var n = n_stack[s]
    if(p._color === BLACK || n._color === BLACK) {
      break
    }
    var pp = n_stack[s-2]
    if(pp.left === p) {
      if(p.left === n) {
        var y = pp.right
        if(y && y._color === RED) {
          //console.log("LLr")
          p._color = BLACK
          pp.right = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("LLb")
          pp._color = RED
          pp.left = p.right
          p._color = BLACK
          p.right = pp
          n_stack[s-2] = p
          n_stack[s-1] = n
          recount(pp)
          recount(p)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.left === pp) {
              ppp.left = p
            } else {
              ppp.right = p
            }
          }
          break
        }
      } else {
        var y = pp.right
        if(y && y._color === RED) {
          //console.log("LRr")
          p._color = BLACK
          pp.right = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("LRb")
          p.right = n.left
          pp._color = RED
          pp.left = n.right
          n._color = BLACK
          n.left = p
          n.right = pp
          n_stack[s-2] = n
          n_stack[s-1] = p
          recount(pp)
          recount(p)
          recount(n)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.left === pp) {
              ppp.left = n
            } else {
              ppp.right = n
            }
          }
          break
        }
      }
    } else {
      if(p.right === n) {
        var y = pp.left
        if(y && y._color === RED) {
          //console.log("RRr", y.key)
          p._color = BLACK
          pp.left = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("RRb")
          pp._color = RED
          pp.right = p.left
          p._color = BLACK
          p.left = pp
          n_stack[s-2] = p
          n_stack[s-1] = n
          recount(pp)
          recount(p)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.right === pp) {
              ppp.right = p
            } else {
              ppp.left = p
            }
          }
          break
        }
      } else {
        var y = pp.left
        if(y && y._color === RED) {
          //console.log("RLr")
          p._color = BLACK
          pp.left = repaint(BLACK, y)
          pp._color = RED
          s -= 1
        } else {
          //console.log("RLb")
          p.left = n.right
          pp._color = RED
          pp.right = n.left
          n._color = BLACK
          n.right = p
          n.left = pp
          n_stack[s-2] = n
          n_stack[s-1] = p
          recount(pp)
          recount(p)
          recount(n)
          if(s >= 3) {
            var ppp = n_stack[s-3]
            if(ppp.right === pp) {
              ppp.right = n
            } else {
              ppp.left = n
            }
          }
          break
        }
      }
    }
  }
  //Return new tree
  n_stack[0]._color = BLACK
  return new RedBlackTree(cmp, n_stack[0])
}


//Visit all nodes inorder
function doVisitFull(visit, node) {
  if(node.left) {
    var v = doVisitFull(visit, node.left)
    if(v) { return v }
  }
  var v = visit(node.key, node.value)
  if(v) { return v }
  if(node.right) {
    return doVisitFull(visit, node.right)
  }
}

//Visit half nodes in order
function doVisitHalf(lo, compare, visit, node) {
  var l = compare(lo, node.key)
  if(l <= 0) {
    if(node.left) {
      var v = doVisitHalf(lo, compare, visit, node.left)
      if(v) { return v }
    }
    var v = visit(node.key, node.value)
    if(v) { return v }
  }
  if(node.right) {
    return doVisitHalf(lo, compare, visit, node.right)
  }
}

//Visit all nodes within a range
function doVisit(lo, hi, compare, visit, node) {
  var l = compare(lo, node.key)
  var h = compare(hi, node.key)
  var v
  if(l <= 0) {
    if(node.left) {
      v = doVisit(lo, hi, compare, visit, node.left)
      if(v) { return v }
    }
    if(h > 0) {
      v = visit(node.key, node.value)
      if(v) { return v }
    }
  }
  if(h > 0 && node.right) {
    return doVisit(lo, hi, compare, visit, node.right)
  }
}


proto.foreach = function(visit, lo, hi) {
  if(!this.root) {
    return
  }
  switch(arguments.length) {
    case 1:
      return doVisitFull(visit, this.root)
    break

    case 2:
      return doVisitHalf(lo, this._compare, visit, this.root)
    break

    case 3:
      if(this._compare(lo, hi) >= 0) {
        return
      }
      return doVisit(lo, hi, this._compare, visit, this.root)
    break
  }
}

//First item in list
Object.defineProperty(proto, "begin", {
  get: function() {
    var stack = []
    var n = this.root
    while(n) {
      stack.push(n)
      n = n.left
    }
    return new RedBlackTreeIterator(this, stack)
  }
})

//Last item in list
Object.defineProperty(proto, "end", {
  get: function() {
    var stack = []
    var n = this.root
    while(n) {
      stack.push(n)
      n = n.right
    }
    return new RedBlackTreeIterator(this, stack)
  }
})

//Find the ith item in the tree
proto.at = function(idx) {
  if(idx < 0) {
    return new RedBlackTreeIterator(this, [])
  }
  var n = this.root
  var stack = []
  while(true) {
    stack.push(n)
    if(n.left) {
      if(idx < n.left._count) {
        n = n.left
        continue
      }
      idx -= n.left._count
    }
    if(!idx) {
      return new RedBlackTreeIterator(this, stack)
    }
    idx -= 1
    if(n.right) {
      if(idx >= n.right._count) {
        break
      }
      n = n.right
    } else {
      break
    }
  }
  return new RedBlackTreeIterator(this, [])
}

proto.ge = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d <= 0) {
      last_ptr = stack.length
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.gt = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d < 0) {
      last_ptr = stack.length
    }
    if(d < 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.lt = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d > 0) {
      last_ptr = stack.length
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

proto.le = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  var last_ptr = 0
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d >= 0) {
      last_ptr = stack.length
    }
    if(d < 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  stack.length = last_ptr
  return new RedBlackTreeIterator(this, stack)
}

//Finds the item with key if it exists
proto.find = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d === 0) {
      return new RedBlackTreeIterator(this, stack)
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  return new RedBlackTreeIterator(this, [])
}

//Removes item with key from tree
proto.remove = function(key) {
  var iter = this.find(key)
  if(iter) {
    return iter.remove()
  }
  return this
}

//Returns the item at `key`
proto.get = function(key) {
  var cmp = this._compare
  var n = this.root
  var stack = []
  while(n) {
    var d = cmp(key, n.key)
    stack.push(n)
    if(d === 0) {
      return n.value
    }
    if(d <= 0) {
      n = n.left
    } else {
      n = n.right
    }
  }
  return
}

//Iterator for red black tree
function RedBlackTreeIterator(tree, stack) {
  this.tree = tree
  this._stack = stack
}

var iproto = RedBlackTreeIterator.prototype

//Test if iterator is valid
Object.defineProperty(iproto, "valid", {
  get: function() {
    return this._stack.length > 0
  }
})

//Node of the iterator
Object.defineProperty(iproto, "node", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1]
    }
    return null
  },
  enumerable: true
})

//Makes a copy of an iterator
iproto.clone = function() {
  return new RedBlackTreeIterator(this.tree, this._stack.slice())
}

//Swaps two nodes
function swapNode(n, v) {
  n.key = v.key
  n.value = v.value
  n.left = v.left
  n.right = v.right
  n._color = v._color
  n._count = v._count
}

//Fix up a double black node in a tree
function fixDoubleBlack(stack) {
  var n, p, s, z
  for(var i=stack.length-1; i>=0; --i) {
    n = stack[i]
    if(i === 0) {
      n._color = BLACK
      return
    }
    //console.log("visit node:", n.key, i, stack[i].key, stack[i-1].key)
    p = stack[i-1]
    if(p.left === n) {
      //console.log("left child")
      s = p.right
      if(s.right && s.right._color === RED) {
        //console.log("case 1: right sibling child red")
        s = p.right = cloneNode(s)
        z = s.right = cloneNode(s.right)
        p.right = s.left
        s.left = p
        s.right = z
        s._color = p._color
        n._color = BLACK
        p._color = BLACK
        z._color = BLACK
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = s
          } else {
            pp.right = s
          }
        }
        stack[i-1] = s
        return
      } else if(s.left && s.left._color === RED) {
        //console.log("case 1: left sibling child red")
        s = p.right = cloneNode(s)
        z = s.left = cloneNode(s.left)
        p.right = z.left
        s.left = z.right
        z.left = p
        z.right = s
        z._color = p._color
        p._color = BLACK
        s._color = BLACK
        n._color = BLACK
        recount(p)
        recount(s)
        recount(z)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = z
          } else {
            pp.right = z
          }
        }
        stack[i-1] = s
        return
      }
      if(s._color === BLACK) {
        if(p._color === RED) {
          //console.log("case 2: black sibling, red parent", p.right.value)
          p._color = BLACK
          p.right = repaint(RED, s)
          return
        } else {
          //console.log("case 2: black sibling, black parent", p.right.value)
          p.right = repaint(RED, s)
          continue  
        }
      } else {
        //console.log("case 3: red sibling")
        s = cloneNode(s)
        p.right = s.left
        s.left = p
        s._color = p._color
        p._color = RED
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.left === p) {
            pp.left = s
          } else {
            pp.right = s
          }
        }
        stack[i-1] = s
        stack[i] = p
        if(i+1 < stack.length) {
          stack[i+1] = n
        } else {
          stack.push(n)
        }
        i = i+2
      }
    } else {
      //console.log("right child")
      s = p.left
      if(s.left && s.left._color === RED) {
        //console.log("case 1: left sibling child red", p.value, p._color)
        s = p.left = cloneNode(s)
        z = s.left = cloneNode(s.left)
        p.left = s.right
        s.right = p
        s.left = z
        s._color = p._color
        n._color = BLACK
        p._color = BLACK
        z._color = BLACK
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = s
          } else {
            pp.left = s
          }
        }
        stack[i-1] = s
        return
      } else if(s.right && s.right._color === RED) {
        //console.log("case 1: right sibling child red")
        s = p.left = cloneNode(s)
        z = s.right = cloneNode(s.right)
        p.left = z.right
        s.right = z.left
        z.right = p
        z.left = s
        z._color = p._color
        p._color = BLACK
        s._color = BLACK
        n._color = BLACK
        recount(p)
        recount(s)
        recount(z)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = z
          } else {
            pp.left = z
          }
        }
        stack[i-1] = s
        return
      }
      if(s._color === BLACK) {
        if(p._color === RED) {
          //console.log("case 2: black sibling, red parent")
          p._color = BLACK
          p.left = repaint(RED, s)
          return
        } else {
          //console.log("case 2: black sibling, black parent")
          p.left = repaint(RED, s)
          continue  
        }
      } else {
        //console.log("case 3: red sibling")
        s = cloneNode(s)
        p.left = s.right
        s.right = p
        s._color = p._color
        p._color = RED
        recount(p)
        recount(s)
        if(i > 1) {
          var pp = stack[i-2]
          if(pp.right === p) {
            pp.right = s
          } else {
            pp.left = s
          }
        }
        stack[i-1] = s
        stack[i] = p
        if(i+1 < stack.length) {
          stack[i+1] = n
        } else {
          stack.push(n)
        }
        i = i+2
      }
    }
  }
}

//Removes item at iterator from tree
iproto.remove = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return this.tree
  }
  //First copy path to node
  var cstack = new Array(stack.length)
  var n = stack[stack.length-1]
  cstack[cstack.length-1] = new RBNode(n._color, n.key, n.value, n.left, n.right, n._count)
  for(var i=stack.length-2; i>=0; --i) {
    var n = stack[i]
    if(n.left === stack[i+1]) {
      cstack[i] = new RBNode(n._color, n.key, n.value, cstack[i+1], n.right, n._count)
    } else {
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
  }

  //Get node
  n = cstack[cstack.length-1]
  //console.log("start remove: ", n.value)

  //If not leaf, then swap with previous node
  if(n.left && n.right) {
    //console.log("moving to leaf")

    //First walk to previous leaf
    var split = cstack.length
    n = n.left
    while(n.right) {
      cstack.push(n)
      n = n.right
    }
    //Copy path to leaf
    var v = cstack[split-1]
    cstack.push(new RBNode(n._color, v.key, v.value, n.left, n.right, n._count))
    cstack[split-1].key = n.key
    cstack[split-1].value = n.value

    //Fix up stack
    for(var i=cstack.length-2; i>=split; --i) {
      n = cstack[i]
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
    cstack[split-1].left = cstack[split]
  }
  //console.log("stack=", cstack.map(function(v) { return v.value }))

  //Remove leaf node
  n = cstack[cstack.length-1]
  if(n._color === RED) {
    //Easy case: removing red leaf
    //console.log("RED leaf")
    var p = cstack[cstack.length-2]
    if(p.left === n) {
      p.left = null
    } else if(p.right === n) {
      p.right = null
    }
    cstack.pop()
    for(var i=0; i<cstack.length; ++i) {
      cstack[i]._count--
    }
    return new RedBlackTree(this.tree._compare, cstack[0])
  } else {
    if(n.left || n.right) {
      //Second easy case:  Single child black parent
      //console.log("BLACK single child")
      if(n.left) {
        swapNode(n, n.left)
      } else if(n.right) {
        swapNode(n, n.right)
      }
      //Child must be red, so repaint it black to balance color
      n._color = BLACK
      for(var i=0; i<cstack.length-1; ++i) {
        cstack[i]._count--
      }
      return new RedBlackTree(this.tree._compare, cstack[0])
    } else if(cstack.length === 1) {
      //Third easy case: root
      //console.log("ROOT")
      return new RedBlackTree(this.tree._compare, null)
    } else {
      //Hard case: Repaint n, and then do some nasty stuff
      //console.log("BLACK leaf no children")
      for(var i=0; i<cstack.length; ++i) {
        cstack[i]._count--
      }
      var parent = cstack[cstack.length-2]
      fixDoubleBlack(cstack)
      //Fix up links
      if(parent.left === n) {
        parent.left = null
      } else {
        parent.right = null
      }
    }
  }
  return new RedBlackTree(this.tree._compare, cstack[0])
}

//Returns key
Object.defineProperty(iproto, "key", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1].key
    }
    return
  },
  enumerable: true
})

//Returns value
Object.defineProperty(iproto, "value", {
  get: function() {
    if(this._stack.length > 0) {
      return this._stack[this._stack.length-1].value
    }
    return
  },
  enumerable: true
})


//Returns the position of this iterator in the sorted list
Object.defineProperty(iproto, "index", {
  get: function() {
    var idx = 0
    var stack = this._stack
    if(stack.length === 0) {
      var r = this.tree.root
      if(r) {
        return r._count
      }
      return 0
    } else if(stack[stack.length-1].left) {
      idx = stack[stack.length-1].left._count
    }
    for(var s=stack.length-2; s>=0; --s) {
      if(stack[s+1] === stack[s].right) {
        ++idx
        if(stack[s].left) {
          idx += stack[s].left._count
        }
      }
    }
    return idx
  },
  enumerable: true
})

//Advances iterator to next element in list
iproto.next = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return
  }
  var n = stack[stack.length-1]
  if(n.right) {
    n = n.right
    while(n) {
      stack.push(n)
      n = n.left
    }
  } else {
    stack.pop()
    while(stack.length > 0 && stack[stack.length-1].right === n) {
      n = stack[stack.length-1]
      stack.pop()
    }
  }
}

//Checks if iterator is at end of tree
Object.defineProperty(iproto, "hasNext", {
  get: function() {
    var stack = this._stack
    if(stack.length === 0) {
      return false
    }
    if(stack[stack.length-1].right) {
      return true
    }
    for(var s=stack.length-1; s>0; --s) {
      if(stack[s-1].left === stack[s]) {
        return true
      }
    }
    return false
  }
})

//Update value
iproto.update = function(value) {
  var stack = this._stack
  if(stack.length === 0) {
    throw new Error("Can't update empty node!")
  }
  var cstack = new Array(stack.length)
  var n = stack[stack.length-1]
  cstack[cstack.length-1] = new RBNode(n._color, n.key, value, n.left, n.right, n._count)
  for(var i=stack.length-2; i>=0; --i) {
    n = stack[i]
    if(n.left === stack[i+1]) {
      cstack[i] = new RBNode(n._color, n.key, n.value, cstack[i+1], n.right, n._count)
    } else {
      cstack[i] = new RBNode(n._color, n.key, n.value, n.left, cstack[i+1], n._count)
    }
  }
  return new RedBlackTree(this.tree._compare, cstack[0])
}

//Moves iterator backward one element
iproto.prev = function() {
  var stack = this._stack
  if(stack.length === 0) {
    return
  }
  var n = stack[stack.length-1]
  if(n.left) {
    n = n.left
    while(n) {
      stack.push(n)
      n = n.right
    }
  } else {
    stack.pop()
    while(stack.length > 0 && stack[stack.length-1].left === n) {
      n = stack[stack.length-1]
      stack.pop()
    }
  }
}

//Checks if iterator is at start of tree
Object.defineProperty(iproto, "hasPrev", {
  get: function() {
    var stack = this._stack
    if(stack.length === 0) {
      return false
    }
    if(stack[stack.length-1].left) {
      return true
    }
    for(var s=stack.length-1; s>0; --s) {
      if(stack[s-1].right === stack[s]) {
        return true
      }
    }
    return false
  }
})

//Default comparison function
function defaultCompare(a, b) {
  if(a < b) {
    return -1
  }
  if(a > b) {
    return 1
  }
  return 0
}

//Build a tree
function createRBTree(compare) {
  return new RedBlackTree(compare || defaultCompare, null)
}
},{}],13:[function(require,module,exports){

var DroppingBuffer = require('./lib/DroppingBuffer'),
    SlidingBuffer = require('./lib/SlidingBuffer'),
    FixedBuffer = require('./lib/FixedBuffer'),
    RingBuffer = require('./lib/RingBuffer');

module.exports = {
  DroppingBuffer: DroppingBuffer,
  SlidingBuffer: SlidingBuffer,
  FixedBuffer: FixedBuffer,
  RingBuffer: RingBuffer,
  dropping: DroppingBuffer.create,
  sliding: SlidingBuffer.create,
  fixed: FixedBuffer.create,
  ring: RingBuffer.create,
  default: FixedBuffer.create
};

},{"./lib/DroppingBuffer":14,"./lib/FixedBuffer":15,"./lib/RingBuffer":16,"./lib/SlidingBuffer":17}],14:[function(require,module,exports){

'use strict';

var util = require('util'),
    assert = require('./assert'),
    makeBuffer = require('./makeBuffer'),
    UnblockingBuffer = require('./buffer').UnblockingBuffer;

module.exports = DroppingBuffer;

function DroppingBuffer(buf, n) {
  this.buf = buf;
  this.n = n;
}

util.inherits(DroppingBuffer, UnblockingBuffer);

DroppingBuffer.prototype = {
  isFull: function() {
    return false;
  },
  remove: function() {
    return this.buf.pop();
  },
  add: function(x) {
    if(!this.isFull()) {
      this.buf.unshift(x);
    }
  },
  count: function() {
    return this.buf.length;
  }
};

DroppingBuffer.create = makeBuffer(DroppingBuffer);

},{"./assert":19,"./buffer":20,"./makeBuffer":21,"util":28}],15:[function(require,module,exports){

'use strict';

var util = require('util'),
    assert = require('./assert'),
    makeBuffer = require('./makeBuffer'),
    Buffer = require('./buffer').Buffer;

module.exports = FixedBuffer;

function FixedBuffer(buf, n) {
  this.buf = buf;
  this.n = n;
}

util.inherits(FixedBuffer, Buffer);

FixedBuffer.prototype = {
  isFull: function() {
    return this.buf.length === this.n;
  },
  remove: function() {
    return this.buf.pop();
  },
  add: function(x) {
    assert(!this.isFull(), 'Cannot add to a full buffer');
    this.buf.unshift(x);
  },
  count: function() {
    return this.buf.length;
  }
};

FixedBuffer.create = makeBuffer(FixedBuffer);

},{"./assert":19,"./buffer":20,"./makeBuffer":21,"util":28}],16:[function(require,module,exports){

'use strict';

var util = require('util'),
    assert = require('./assert'),
    arrayCopy = require('./arrayCopy'),
    UnblockingBuffer = require('./buffer').UnblockingBuffer;

module.exports = RingBuffer;

function RingBuffer(head, tail, length, arr) {
  assert(Array.isArray(arr), 'Last argument to RingBuffer() must be of type array');

  this.head = head   | 0;
  this.tail = tail   | 0;
  this.length = length | 0;
  this.arr = arr;
}

util.inherits(RingBuffer, UnblockingBuffer);

RingBuffer.prototype = {
  pop: function() {
    if(this.length !== 0) {
      var x = this.arr[this.tail];
      this.arr[this.tail] = null;
      this.tail = (this.tail + 1) % this.arr.length;
      this.length -= 1;
      return x;
    }
  },

  unshift: function(x) {
    this.arr[this.head] = x;
    this.head = (this.head + 1) % this.arr.length;
    this.length += 1;
  },

  unboundedUnshift: function(x) {
    if(this.length + 1 === this.arr.length) {
      this.resize();
    }
    return this.unshift(x);
  },

  resize: function() {
    var newSize = this.arr.length * 2,
        newArr = Array(newSize);

    if(this.tail < this.head) {
      arrayCopy(this.arr, this.tail, newArr, 0, this.length);
      this.tail = 0;
      this.tail = this.length;
    }
    else if(this.tail > this.head) {
      arrayCopy(this.arr, this.tail, newArr, 0, this.length - this.tail);
      arrayCopy(this.arr, 0, newArr, this.length - this.tail, this.head);
      this.tail = 0;
      this.head = this.length;
    }
    else if(this.head === this.tail) {
      this.head = this.tail = 0;
    }

    this.arr = newArr;
  },

  cleanup: function(keep) {
    var keepFn = (typeof keep === 'function') ? keep : function() {
      return keep === true;
    };

    for(var i = 0; i < this.length; i += 1) {
      var v = this.pop();
      if(keepFn(v)) {
        this.unshift(v);
      }
    }
  }
};

RingBuffer.create = function(n) {
  if(typeof n !== 'number') {
    throw new Error('Cannot create a buffer of non-numeric size');
  }
  if(n <= 0) {
    throw new Error('Cannot create a buffer of size <= 0');
  }
  return new RingBuffer(0, 0, 0, Array(n));
};

},{"./arrayCopy":18,"./assert":19,"./buffer":20,"util":28}],17:[function(require,module,exports){

'use strict';

var util = require('util'),
    assert = require('./assert'),
    makeBuffer = require('./makeBuffer'),
    UnblockingBuffer = require('./buffer').UnblockingBuffer;

module.exports = SlidingBuffer;

function SlidingBuffer(buf, n) {
  this.buf = buf;
  this.n = n;
}

util.inherits(SlidingBuffer, UnblockingBuffer);

SlidingBuffer.prototype = {
  isFull: function() {
    return false;
  },
  remove: function() {
    return this.buf.pop();
  },
  add: function(x) {
    if(this.isFull()) {
      this.remove();
    }
    this.buf.unshift(x);
  },
  count: function() {
    return this.buf.length;
  }
};

SlidingBuffer.create = makeBuffer(SlidingBuffer);

},{"./assert":19,"./buffer":20,"./makeBuffer":21,"util":28}],18:[function(require,module,exports){

'use strict';

function arrayCopy(src, srcStart, dest, destStart, len) {
  for(var i = 0; i < len; i += 1) {
    dest[destStart + i] = src[srcStart + i];
  }
}

module.exports = arrayCopy;

},{}],19:[function(require,module,exports){

'use strict';

function assert(condition, message) {
  if(!condition) {
    throw new Error(message);
  }
}

module.exports = assert;

},{}],20:[function(require,module,exports){

'use strict';

var util = require('util');

module.exports = {
  Buffer: Buffer,
  UnblockingBuffer: UnblockingBuffer
};

// interface Buffer {
//   isFull()
//   add()
//   remove()
//   count
// }
function Buffer() {}

// interface UnblockingBuffer extends Buffer
function UnblockingBuffer() {}

util.inherits(UnblockingBuffer, Buffer);

},{"util":28}],21:[function(require,module,exports){

'use strict';

var RingBuffer = require('./RingBuffer');

function makeBuffer(BufferType) {
  return function(n) {
    if(typeof n !== 'number') {
      throw new Error('Can\'t create a buffer of non-numeric size');
    }
    if(n <= 0) {
      throw new Error('Can\'t create a buffer of size <= 0');
    }
    return new BufferType(RingBuffer.create(n), n);
  }
}

module.exports = makeBuffer;

},{"./RingBuffer":16}],22:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],23:[function(require,module,exports){
/**
 * Copyright (c) 2013, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

(function(
  // Reliable reference to the global object (i.e. window in browsers).
  global,

  // Dummy constructor that we use as the .constructor property for
  // functions that return Generator objects.
  GeneratorFunction
) {
  var hasOwn = Object.prototype.hasOwnProperty;

  if (global.wrapGenerator) {
    return;
  }

  function wrapGenerator(innerFn, self) {
    return new Generator(innerFn, self || null);
  }

  global.wrapGenerator = wrapGenerator;
  if (typeof exports !== "undefined") {
    exports.wrapGenerator = wrapGenerator;
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  wrapGenerator.mark = function(genFun) {
    genFun.constructor = GeneratorFunction;
    return genFun;
  };

  // Ensure isGeneratorFunction works when Function#name not supported.
  if (GeneratorFunction.name !== "GeneratorFunction") {
    GeneratorFunction.name = "GeneratorFunction";
  }

  wrapGenerator.isGeneratorFunction = function(genFun) {
    var ctor = genFun && genFun.constructor;
    return ctor ? GeneratorFunction.name === ctor.name : false;
  };

  function Generator(innerFn, self) {
    var generator = this;
    var context = new Context();
    var state = GenStateSuspendedStart;

    function invoke() {
      state = GenStateExecuting;
      do {
        var value = innerFn.call(self, context);
      } while (value === ContinueSentinel);
      // If an exception is thrown from innerFn, we leave state ===
      // GenStateExecuting and loop back for another invocation.
      state = context.done
        ? GenStateCompleted
        : GenStateSuspendedYield;
      return { value: value, done: context.done };
    }

    function assertCanInvoke() {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        throw new Error("Generator has already finished");
      }
    }

    function handleDelegate(method, arg) {
      var delegate = context.delegate;
      if (delegate) {
        try {
          var info = delegate.generator[method](arg);
        } catch (uncaught) {
          context.delegate = null;
          return generator.throw(uncaught);
        }

        if (info) {
          if (info.done) {
            context[delegate.resultName] = info.value;
            context.next = delegate.nextLoc;
          } else {
            return info;
          }
        }

        context.delegate = null;
      }
    }

    generator.next = function(value) {
      assertCanInvoke();

      var delegateInfo = handleDelegate("next", value);
      if (delegateInfo) {
        return delegateInfo;
      }

      if (state === GenStateSuspendedYield) {
        context.sent = value;
      }

      while (true) try {
        return invoke();
      } catch (exception) {
        context.dispatchException(exception);
      }
    };

    generator.throw = function(exception) {
      assertCanInvoke();

      var delegateInfo = handleDelegate("throw", exception);
      if (delegateInfo) {
        return delegateInfo;
      }

      if (state === GenStateSuspendedStart) {
        state = GenStateCompleted;
        throw exception;
      }

      while (true) {
        context.dispatchException(exception);
        try {
          return invoke();
        } catch (thrown) {
          exception = thrown;
        }
      }
    };
  }

  Generator.prototype.toString = function() {
    return "[object Generator]";
  };

  function Context() {
    this.reset();
  }

  Context.prototype = {
    constructor: Context,

    reset: function() {
      this.next = 0;
      this.sent = void 0;
      this.tryStack = [];
      this.done = false;
      this.delegate = null;

      // Pre-initialize at least 20 temporary variables to enable hidden
      // class optimizations for simple generators.
      for (var tempIndex = 0, tempName;
           hasOwn.call(this, tempName = "t" + tempIndex) || tempIndex < 20;
           ++tempIndex) {
        this[tempName] = null;
      }
    },

    stop: function() {
      this.done = true;

      if (hasOwn.call(this, "thrown")) {
        var thrown = this.thrown;
        delete this.thrown;
        throw thrown;
      }

      return this.rval;
    },

    keys: function(object) {
      return Object.keys(object).reverse();
    },

    pushTry: function(catchLoc, finallyLoc, finallyTempVar) {
      if (finallyLoc) {
        this.tryStack.push({
          finallyLoc: finallyLoc,
          finallyTempVar: finallyTempVar
        });
      }

      if (catchLoc) {
        this.tryStack.push({
          catchLoc: catchLoc
        });
      }
    },

    popCatch: function(catchLoc) {
      var lastIndex = this.tryStack.length - 1;
      var entry = this.tryStack[lastIndex];

      if (entry && entry.catchLoc === catchLoc) {
        this.tryStack.length = lastIndex;
      }
    },

    popFinally: function(finallyLoc) {
      var lastIndex = this.tryStack.length - 1;
      var entry = this.tryStack[lastIndex];

      if (!entry || !hasOwn.call(entry, "finallyLoc")) {
        entry = this.tryStack[--lastIndex];
      }

      if (entry && entry.finallyLoc === finallyLoc) {
        this.tryStack.length = lastIndex;
      }
    },

    dispatchException: function(exception) {
      var finallyEntries = [];
      var dispatched = false;

      if (this.done) {
        throw exception;
      }

      // Dispatch the exception to the "end" location by default.
      this.thrown = exception;
      this.next = "end";

      for (var i = this.tryStack.length - 1; i >= 0; --i) {
        var entry = this.tryStack[i];
        if (entry.catchLoc) {
          this.next = entry.catchLoc;
          dispatched = true;
          break;
        } else if (entry.finallyLoc) {
          finallyEntries.push(entry);
          dispatched = true;
        }
      }

      while ((entry = finallyEntries.pop())) {
        this[entry.finallyTempVar] = this.next;
        this.next = entry.finallyLoc;
      }
    },

    delegateYield: function(generator, resultName, nextLoc) {
      var info = generator.next(this.sent);

      if (info.done) {
        this.delegate = null;
        this[resultName] = info.value;
        this.next = nextLoc;

        return ContinueSentinel;
      }

      this.delegate = {
        generator: generator,
        resultName: resultName,
        nextLoc: nextLoc
      };

      return info.value;
    }
  };
}).apply(this, Function("return [this, function GeneratorFunction(){}]")());

},{}],24:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":28}],25:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],26:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],27:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],28:[function(require,module,exports){
var process=require("__browserify_process"),global=typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

},{"./support/isBuffer":27,"__browserify_process":26,"inherits":25}]},{},[1])

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

  co.go(function*() {
    while (true) {
      var value = yield co.take(ch);

      if (value === null) {
        out.close();
        return;
      }

      if (p(value)) {
        yield co.put(ch, value);
      }
    }
  });

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

  co.go(function*() {
    while (true) {
      var val = yield co.take(ch);
      if (val === null) {
        out.close();
        return;
      }

      var coll = f(val);
      if (!Array.isArray(coll)) {
        throw new Error('non-array returned by the given function.');
      }

      for (var p in coll) {
        yield co.put(out, coll[p]);
      }

      if (out.isClosed()) {
        return;
      }
    }
  });

  return out;
};

exports.pipe = function(from, to, close) {
  close = close != null && close || true;

  co.go(function*() {
    while (true) {
      var v = yield co.take(from);
      if (v === null) {
        if (close) {
          to.close();
        }
        break;
      }

      var ret = yield co.put(to, v);

      if (ret == null) {
        break;
      }
    }
  });
  return to;
};

exports.split = function(p, ch, tBufOrN, fBufOrN) {
  var t = chan(tBufOrN),
      f = chan(fBufOrN);

  co.go(function*() {
    while (true) {
      var v = yield co.take(ch);
      if (v === null) {
        t.close();
        f.close();
        break;
      }
      var ret = yield co.put(p(v) ? t : f, v);
      if (ret == null) {
        break;
      }
    }
  });

  return [t, f];
};

exports.reduce = function(f, init, ch) {
  return co.go(function*() {
    var ret = init;

    while (true) {
      var v = yield co.take(ch);
      if (v === null) {
        return ret;
      }
      ret = f(ret, v);
    }
  });
};

// FIXME: This is a stub. The channel should close after all elements have been emitted.
exports.toChan = function(coll) {
  return chan(new FixedBuffer(coll.reverse(), coll.length));
};

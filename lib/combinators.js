
'use strict';

var co = require('./coroutines'),
    assert = require('assert'),
    chan = require('./chan'),
    Channel = require('./Channel'),
    ChannelProxy = require('./ChannelProxy'),
    assert = require('assert'),
    handler = require('./handler'),
    Handler = handler.Handler;

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
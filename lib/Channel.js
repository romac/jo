
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
}

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

  close: function() {
    if (this.closed) {
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

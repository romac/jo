
'use strict';

var assert = require('./assert'),
    dispatcher = require('./dispatch'),
    helpers = require('./helpers'),
    buffers = require('chronic-buffers');

module.exports = ManyToManyChannel;

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

function ManyToManyChannel(takes, dirtyTakes, puts, dirtyPuts, buf, closed) {
  this.takes = takes;
  this.dirtyTakes = dirtyTakes;
  this.puts = puts;
  this.dirtyPuts = dirtyPuts;
  this.buf = buf;
  this.closed = closed;
}


ManyToManyChannel.create = function(buf) {
  return new ManyToManyChannel(
    buffers.ring(32),
    0,
    buffers.ring(32),
    0,
    buf,
    null
  );
};

function nop() {}

ManyToManyChannel.prototype = {

  putAsync: function putAsync(value, fn, onCaller) {
    fn = (fn != null) ? fn : nop;
    onCaller = (onCaller != null) ? onCaller : true;

    var ret = this._putAsync(value, helpers.fnHandler(fn));

    if (!ret || fn === nop) {
      return;
    }

    if (onCaller) {
      return fn();
    }

    dispatcher.run(fn);
  },


  _putAsync: function _putAsync(value, handler) {
    assert(value != null, 'Cannot put a null value in a channel');

    if (this.closed || !this.handler.isActive()) {
      return;
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
      }
      else {
        if (this.buf != null && !this.buf.isFull()) {
          handler.commit();
          this.buf.add(value);
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

        this.puts.unboundedShift(new PutBox(handler, value));
      }

      break;
    }
  },

  takeAsync: function takeAsync(fn, onCaller) {
    onCaller = (onCaller != null) ? onCaller : true;

    var ret = this._takeAsync(helpers.fnHandler(fn));

    if (!ret) {
      return;
    }

    if (onCaller) {
      return fn(ret);
    }

    dispatcher.run(function() {
      fn(ret);
    });
  },

  _takeAsync: function _takeAsync(handler) {
    if (!this.handler.isActive()) {
      return;
    }

    if (this.buf != null && this.buf.count > 0) {
      handler.commit();
      return this.buf.remove();
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

        return putter.val;
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

      this.takes.unboundedShift(handler);
    }
  },

  close: function close() {
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
    }
  }
};

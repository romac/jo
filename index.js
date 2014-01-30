
var ManyToManyChannel = require('./lib/ManyToManyChannel'),
    buffers = require('chronic-buffers'),
    helpers = require('./lib/helpers'),
    dspatcher = require('./lib/dispatch');

module.exports = {
  ManyToManyChannel: ManyToManyChannel,
  chan: chan
};

function chan(bufOrN) {
  if (!bufOrN) {
    return ManyToManyChannel.create(null);
  }

  var buf = typeof bufOrN === 'number'
    ? buffers.default(bufOrN)
    : bufOrN;

  return ManyToManyChannel.create(buf);
}

function takeAsync(port, fn, onCaller) {
  onCaller = (onCaller != null) ? onCaller : true;

  var ret = port.take(helpers.fnHandler(fn));

  if (!ret) {
    return;
  }

  if (onCaller) {
    fn(ret);
  }
  else {
    dispatcher.run(function() {
      fn(ret);
    });
  }
}

function nop() {}

function putAsync(port, value, fn, onCaller) {
  fn = (fn != null) ? fn : nop;
  onCaller = (onCaller != null) ? onCaller : true;

  var ret = port.putAsync(value, helpers.fnHandler(fn));

  if (!ret || fn === nop) {
    return;
  }

  if (onCaller) {
    fn();
  } else {
    dispatcher.run(fn);
  }
}

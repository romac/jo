
'use strict';

var chan = require('./chan'),
    slice = Array.prototype.slice;

module.exports = {
  listen: listen,
  on: on,
  once: once
};

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

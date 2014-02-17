
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

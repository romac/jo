
'use strict';

var ManyToManyChannel = require('./ManyToManyChannel'),
    buffers = require('chronic-buffers');

module.exports = function chan(bufOrN) {
  if (!bufOrN) {
    return ManyToManyChannel.create(null);
  }

  var buf = typeof bufOrN === 'number' ? buffers.default(bufOrN) : bufOrN;

  return ManyToManyChannel.create(buf);
};

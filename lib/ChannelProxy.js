
var util = require('util'),
    Channel = require('./Channel'),
    assert = require('assert');

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

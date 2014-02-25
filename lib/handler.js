
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

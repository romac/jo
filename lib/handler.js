
'use strict';

function Handler(isActive, commit) {
  this.isActive = isActive;
  this.commit = commit;
}

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

module.exports = fromFunction;
module.exports.Handler = Handler;

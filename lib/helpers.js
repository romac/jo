
'use strict';

module.exports = {
  Handler: Handler,
  fnHandler: fnHandler
};

function Handler(isActive, commit) {
  this.isActive = isActive;
  this.commit = commit;
}

function fnHandler(f) {
  return new Handler(
    function() {
      return true;
    },
    function() {
      return f;
    }
  );
}

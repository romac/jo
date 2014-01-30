
'use strict';

module.exports = {
  fnHandler: fnHandler
};

function fnHandler(f) {
  return {
    isActive: function isActive() {
      return true;
    },
    commit: function commit() {
      return f;
    }
  };
}

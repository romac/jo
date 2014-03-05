
// http://swannodette.github.io/2013/07/12/communicating-sequential-processes/

'use strict';

var jo = require('../../..');

var $ = document.querySelector.bind(document);

var el1 = $('#ex1');
var c1 = jo.listen(el1, 'mousemove');

jo.go(function*() {
  while (true) {
    var e = yield jo.take(c1);
    el1.innerHTML = e.offsetX + ', ' + e.offsetY;
  }
});

// ----

function location(e) {
  return {
    x: e.x,
    y: e.y
  };
}

var el2 = $('#ex2');
var c2 = jo.map(location, jo.listen(el2, 'mousemove'));

jo.go(function*() {
  while (true) {
    var e = yield jo.take(c2);
    el2.innerHTML = e.x + ', ' + e.y;
  }
});

// ----

var el3 = $('#ex3');
var el3Mouse = $('#ex3-mouse');
var el3Key = $('#ex3-key');
var c3m = jo.listen(el3, 'mousemove');
var c3k = jo.listen(window, 'keyup');

jo.go(function*() {
  while (true) {
    yield jo.select(
      [c3m, function(e) {
        el3Mouse.innerHTML = e.offsetX + ', ' + e.offsetY;
      }],
      [c3k, function(e) {
        el3Key.innerHTML = e.keyCode;
      }]
    );
  }
});

// Alternatively, using alts():

/*

jo.go(function*() {
  while (true) {
    var r = yield jo.alts([c3m, c3k]);
    var e = r.value;

    if (r.chan === c3m) {
      el3Mouse.innerHTML = e.offsetX + ', ' + e.offsetY;
    }
    else {
      el3Key.innerHTML = e.keyCode;
    }
  }
});

*/

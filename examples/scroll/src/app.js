
// http://swannodette.github.io/2013/07/12/communicating-sequential-processes/

'use strict';

var jo = require('../../..');

var c = jo.chan();

function render(q)
{
  return q.concat().reverse().map(function(p) {
    return '<div class="proc-' + p + '">Process ' + p + '</div>';
  }).join('\n');
}

function loop(interval, num)
{
  return function*() {
    while (true) {
      yield jo.wait(interval);
      yield jo.put(c, num);
    }
  };
}

function peekn(v, n)
{
  if (v.length < n) {
    return v;
  }

  return v.slice(v.length - n);
}

jo.go(loop(250,  1));
jo.go(loop(1000, 2));
jo.go(loop(1500, 3));

var $ = document.querySelector.bind(document);
var el = $('#ex');

jo.go(function*() {
  var q = [];
  while (true) {
    el.innerHTML = render(q);
    q = peekn(q.concat([yield jo.take(c)]), 10);
  }
});

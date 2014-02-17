### Macros

A few [sweet.js](http://sweetjs.org/) macros are bundled that will make your code more readable and concise, if choose you to use them.

Here's the example above, rewritten using macros:

```js
var jo = require('jo'),
    go = jo.go,
    take = jo.take,
    put = jo.put,
    chan = jo.chan;

var c = chan(1);

go {
  var i = 0;
  while (true) {
    i <- c;
    console.log('ping got "%s".', i);
    i + 1 -> c;
  }
};

c.put(1);
```

We still need to import Jo and setup the aliases (for now), but the code is now much more consise, while fully hiding the underlying generators.

Here's another example:

```js
var jo = require('jo'),
    go = jo.go,
    defer = jo.defer;

function doStuff(foo, bar, cb) {
  setTimeout(function() {
    cb(null, {foo: foo, bar: bar});
  }, 200);
}

go {
  defer doStuff('toto', 1224);
};
```

This code will expand to:

```js
var jo = require('jo'),
    go = jo.go,
    defer = jo.defer;

function doStuff(foo, bar, cb) {
  setTimeout(function() {
    cb(null, {foo: foo, bar: bar});
  }, 200);
}

go(function*() {
  console.log('will do stuff');
  
  var res = yield defer(doStuff, 'toto', 1224));
  
  console.log('foo is %s, bar is %s', res[1].foo, res[1].bar);
});
```

See how the `defer` macro spliced `doStuff()`'s arguments into `defer()` itself? Neat, right?

## [chronic](https://romac.me/projects/chronic)  [![Build Status](https://travis-ci.org/romac/chronic.png?branch=master)](https://travis-ci.org/romac/chronic)

> A port to JavaScript of ClojureScript's core.async.

### Usage

```js
var chro = require('chronic'),
    go = chro.go,
    take = chro.take,
    put = chro.put,
    chan = chro.chan;

var c = chan(1);

go(function*() {
  var i = 0;
  while (true) {
    i = yield take(c);
    console.log('ping got "%s".', i);
    yield put(c, i + 1);
  }
});

go(function*() {
  var i = 0;
  while (true) {
    i = yield take(c);
    console.log('pong got "%s".', i);
    yield put(c, i + 1);
  }
});

c.put(1);
```

Note: We must use `Channel#put(value)` in the last line because we are not inside a `go` block. This operation is thus executed asynchronously.

### API

#### `chan(size) :: Int -> Channel`
Creates a buffered channel with a buffer of size `size`.

#### `chan(buffer) :: Buffer -> Channel`
Creates a channel with the supplied buffer.
See [chronic-buffers](romac/chronic-buffers) for an overview of the available buffers.

#### `chan() :: Unit -> Channel`
Creates an unbuffered channel.

#### `go(gen*) :: Function* -> Channel`
Spawn the given generator, and returns a channel that receives the value returned by the coroutine.

#### `yield take(chan) :: Channel -> Unit`
Blocks until a value is available on the given channel, and returns it.

#### `yield put(chan) :: Channel -> Unit`
Puts a value on the given channel. If the channel is buffered, this will block until the channel accepts the value.

#### `yield wait(ms) :: Int -> Unit`
Block for `ms` milliseconds.

#### `yield defer(fn, ...args) :: Function -> Any... -> [Error, Any]`
Call `fn` with the supplied arguments `args`, and returns an array holding the error (if any) and an array of values passed by `fn` to the internal callback.

#### `timeout(ms) :: Int -> Channel`
Creates a channel that will close after `ms` milliseconds.

### Macros

A few SweetJS macros are bundled that will make your code more readable and concise, if choose you to use them.

Here's the example above, rewritten using macros:

```js
var chro = require('chronic'),
    go = chro.go,
    take = chro.take,
    put = chro.put,
    chan = chro.chan;

var c = chan(1);

go {
  var i = 0;
  while (true) {
    i &lt;! c;
    console.log('ping got "%s".', i);
    i + 1 !&gt; c;
  }
};

c.put(1);
```

We still need to import chronic and setup the aliases (for now), but the code is now much more consise, while fully hiding the underlying generators.

Here's another example:

```js
var chro = require('chronic'),
    go = chro.go,
    defer = chro.defer;

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
var chro = require('chronic'),
    go = chro.go,
    defer = chro.defer;

function doStuff(foo, bar, cb) {
  setTimeout(function() {
    cb(null, {foo: foo, bar: bar});
  }, 200);
}

go {
  console.log('will do stuff');
  
  var res = defer doStuff('toto', 1234);
  
  console.log('foo is %s, bar is %s', res[1].foo, res[1].bar);
}

go(function*() {
  console.log('will do stuff');
  
  var res = yield defer(doStuff, 'toto', 1224));
  
  console.log('foo is %s, bar is %s', res[1].foo, res[1].bar);
});
```

See how the `defer` macro spliced `doStuff()`'s arguments into `defer()` itself? Neat, right?

### License

chronic is released under the [MIT license](http://romac.mit-license.org/).

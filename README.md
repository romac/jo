
## Jo

> A port to JavaScript of ClojureScript's core.async channels.

### Notice

This library is experimental and I do not currently plan to publish it to npm. Please use another implementation of CSP channels, such as [js-csp](https://github.com/ubolonton/js-csp) or [task.js](http://taskjs.org/).

### Usage

```js
var jo = require('jo')

var c = jo.chan(1);

jo.go(function*() {
  var i = 0;
  while (true) {
    i = yield jo.take(c);
    console.log('ping got "%s".', i);
    yield jo.put(c, i + 1);
  }
});

jo.go(function*() {
  var i = 0;
  while (true) {
    i = yield jo.take(c);
    console.log('pong got "%s".', i);
    yield jo.put(c, i + 1);
  }
});

// asynchronously put a value into the channel
c.put(1);
```

Note: We must use `Channel#put(value)` in the last line because we are not inside a `go` block. This operation is thus executed asynchronously.

### API

#### `chan(size) :: Int -> Channel`
Creates a buffered channel with a buffer of size `size`.

#### `chan(buffer) :: Buffer -> Channel`
Creates a channel with the supplied buffer.
See [jo-buffers](romac/jo-buffers) for an overview of the available buffers.

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

#### `yield await(fn, ...args) :: Function -> Any... -> [Error, Any]`
Call `fn` with the supplied arguments `args`, and returns an array holding the error (if any) and an array of values passed by `fn` to the internal callback.

#### `timeout(ms) :: Int -> Channel`
Creates a channel that will close after `ms` milliseconds.

### Macros
A few [sweet.js](http://sweetjs.org/) macros are bundled with jo. You can find a README, and some examples in the `macros/` folder.

### Copyright and license

Copyright © 2014 Romain Ruetschi

Licensed under the Eclipse Public License (see the file epl.html).

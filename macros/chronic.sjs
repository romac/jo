let go = macro {
  rule { { $body ... } } => {
    go(function* () {
      $body ...
    });
  }
}

macro <- {
  rule infix { $lhs:ident | $rhs:expr } => {
    $lhs = yield take($rhs)
  }
  rule infix { var $lhs:ident | $rhs:expr } => {
    var $lhs = yield take($rhs)
  }
}

macro -> {
   rule infix { $lhs:expr | $rhs:expr } => {
     yield put($rhs, $lhs)
   }
}

let wait = macro {
  rule { $ms:expr } => {
    yield wait($ms)
  }
}

let after = macro {
  rule { $ms:expr : $value:expr } => {
    yield after($ms, $value)
  }
}

let await = macro {
  rule { $fn ($args (,) ...) } => {
    yield await($fn, $args (,) ...)
  }
}

macro gowhile {
  rule { ( $cond:expr ) { $body ... } } => {
    go(function* () {
      while ( $cond ) {
        $body ...
      }
    });
  }
}

macro loop {
  rule { ( $name:ident ) { $body ... } } => {
   var $name = true;
    while ( $name ) {
      $name = false;
      $body ...
    }
  }
}

macro recur {
  rule { ( $name:ident ) } => {
      $name = true
    }
}

let go = macro {
  rule { { $body ... } } => {
    go(function* () {
      $body ...
    });
  }
}

macro <- {
  rule infix { $lhs:ident | [ $chans (,) ... ] } => {
    $lhs = yield select([$chans (,) ...])
  }
  rule infix { var $lhs:ident | [ $chans (,) ... ] } => {
    var $lhs = yield select([$chans (,) ...])
  }
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

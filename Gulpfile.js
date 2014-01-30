
var gulp = require('gulp'),
    gutil = require('gulp-util'),
    concat = require('gulp-concat'),
    browserify = require('gulp-browserify');

// FIXME: Pass --standalone to browserify
gulp.task('build:browser', function() {
  gulp.src('./index.js')
    .pipe(browserify({
      // standalone: 'Chronic.Buffers',
      debug : !gutil.env.production
    }))
    .pipe(concat('channels.js'))
    .pipe(gulp.dest('./build/browser'));
});

// FIXME: Write proper unit tests
gulp.task('test:browser', function() {
  gulp.src('./test/browser/index.js')
    .pipe(browserify({
      insertGlobals : true,
      debug : !gutil.env.production
    }))
    .pipe(concat('bundle.js'))
    .pipe(gulp.dest('./test/browser'));
});

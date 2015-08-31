var gulp = require('gulp')
var ifElse = require('gulp-if-else')
var less = require('gulp-less')
var livereload = require('gulp-livereload')
var buffer = require('vinyl-buffer')
var browserify = require('browserify')
var source = require('vinyl-source-stream')
var size = require('gulp-size')
var uglify = require('gulp-uglify')
var isProduction = true

gulp.task('less', function() {
  gulp.src('less/*.less')
    .pipe(less())
    .pipe(gulp.dest('public/css'))
    .pipe(livereload());
})


gulp.task('browserify:app', function() {
    var b = browserify({entries: './lib/dotd.js', debug: false})

    return b.bundle()
        .pipe(source('dotd.js'))
        .pipe(buffer())
        // .pipe(ifElse(isProduction, uglify))
        .pipe(gulp.dest('./public/js'))
        .pipe(size())
})

gulp.task('watch', function() {
    livereload.listen();
    gulp.watch('less/*.less', ['less'])
    gulp.watch('lib/*.js', ['browserify:app'])
})


gulp.task('default', ['less', 'browserify:app'])

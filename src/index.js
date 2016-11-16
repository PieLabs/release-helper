const _ = require('lodash'),
  runSequence = require('run-sequence'),
  conventionalGithubReleaser = require('conventional-github-releaser'),
  gutil = require('gulp-util'),
  git = require('gulp-git'),
  fs = require('fs-extra'),
  semver = require('semver'),
  minimist = require('minimist'),
  path = require('path');

let args = minimist(process.argv.slice(2));
let bumpType = args['bump-type'] || args.bumpType || 'minor';
let githubToken = args['github-token'] || args.githubToken || process.env.GITHUB_TOKEN;

exports.init = function(gulp, dir = process.cwd()){

  let pkgPath = () => path.join(dir, 'package.json');
  let getPackageJson = () => fs.readJsonSync( pkgPath(), 'utf8');
  let writePackageJson = (obj) => fs.writeJsonSync( pkgPath(), obj, 'utf8');

  let getPackageJsonVersion = () => getPackageJson().version;

  let commitChanges = (msg) => {
    return gulp.src(dir)
      .pipe(git.add())
      .pipe(git.commit(msg));
  }

  gulp.task('commit-release-changes', () => commitChanges(`[release] set version number to ${getPackageJsonVersion()}`));
  gulp.task('commit-bump-changes', () => commitChanges(`[bump] set version number to ${getPackageJsonVersion()}`));

  let checkout = (name) => (done => git.checkout(name, done));
  let pull = (origin, name) => (done => git.pull(origin, name, done));
  let merge = (name, opts) => (done => git.merge(name, opts, done));
  let push = (origin, name, opts) => (done => git.push(origin, name, opts || {}, done));

  gulp.task('checkout-develop', checkout('develop'));
  gulp.task('checkout-master', checkout('master'));
  gulp.task('pull-develop', pull('origin', 'develop'));
  gulp.task('pull-master', pull('origin', 'master'));
  gulp.task('merge-develop', merge('develop', { args: '-X theirs' }));
  gulp.task('push-master', push('origin', 'master', { args: '--tags' }));
  gulp.task('push-develop', push('origin', 'develop'));

  //TODO: This doesn't pickup messages in merge commits - so it's a bit of a pita - but we'll try it out for now.
  gulp.task('github-release', (done) => {
    conventionalGithubReleaser({
      type: 'oauth',
      token: githubToken,
    }, 
    {
      preset: 'angular'
    }, 
    {},
    { 
      merges: true,
      debug: gutil.log.bind(gutil)
    },
      (err, result) => {

        if(err){
          done(err);
        } else {
          let rejections = _.filter(result, r => r.state === 'rejected');

          if(rejections.length > 0){
            _.forEach(rejections, r => {
              _.forEach(r.reason, reason => gutil.log(reason.message));
            });
            done(new Error('github release rejected'));
            return;
          } else {
            gutil.log('err? ', err);
            gutil.log('result:  ', result);
            done();
          }
        }
      });
  });

  let baseVersion = (v) => {
    let major = semver.major(v);
    let minor = semver.minor(v);
    let patch = semver.patch(v);
    return `${major}.${minor}.${patch}`;
  }

  //https://github.com/npm/node-semver/pull/96/files
  gulp.task('strip-prerelease-version', (done) => {

    git.revParse({args:'--abbrev-ref HEAD'}, (err, b) => {

      gutil.log('branch:', b);

      if(b !== 'master'){
        done(new Error('not on master'));
        return;
      } 

      let pkg = getPackageJson();
      gutil.log('pkg: ', typeof pkg, pkg);
      let v = pkg.version;
      let stripped = baseVersion(v);
      gutil.log('strip version:', v, '->', stripped);
      pkg.version = stripped;
      writePackageJson(pkg);
      done();

    });
  });

  gulp.task('ensure-clean', (done) => {
    return git.status({ args: '--porcelain' }, (err, stdout) => {
      if (err) {
        done(err);
      } else {
        let lines = _(stdout.split('\n'))
          .filter(l => !_.isEmpty(l))
          .map(l => l.trim()).value();
        if (lines.length > 0) {
          done(new Error('working tree not clean: ' + lines));
        } else {
          done();
        }
      }
    });
  });

  gulp.task('create-new-tag', (done) => {
    var version = getPackageJsonVersion();
    git.tag(`v${version}`, 'Created Tag for version: ' + version, done);
  });

  gulp.task('bump-develop', function (done) {
    let pkg = getPackageJson();
    let v = baseVersion(pkg.version);
    v = semver.inc(v, bumpType || 'minor');
    gutil.log('v: ', v);
    pkg.version = `${v}-prerelease`;
    gutil.log('new develop version: ', pkg.version);
    writePackageJson('./package.json', pkg);
    done();
  });

  const request = require('request');

  gulp.task('check-github', (done) => {

    let result = (body) => {
      if(typeof body === 'string'){
        gutil.log('need to parse the response body...')
        return JSON.parse(body);
      } else {
        return body;
      }
    }

    let url = 'https://status.github.com/api/status.json';
    request(url, (err, response, body) => {
      if(result(body).status === 'good'){
        gutil.log(gutil.color.green('github is up and running...'));
        done();
      } else {
        done(new Error('github is down: ' + body));
      }
    });
  });

  gulp.task('release', (done) => {
    
    if(!githubToken){
      done(new Error('No github token defined!'));
      return;
    }

    runSequence(
      'check-github',
      'ensure-clean',
      'checkout-develop',
      'pull-develop',
      'checkout-master',
      'pull-master',
      'merge-develop',
      'strip-prerelease-version',
      // 'commit-release-changes',
      // 'create-new-tag',
      // 'push-master',
      // 'github-release',
      // 'checkout-develop',
      // 'bump-develop',
      // 'commit-bump-changes',
      // 'push-develop',
      (error) => {
        if (error) {
          gutil.log(error.message);
        } else {
          gutil.log(gutil.colors.green('RELEASE FINISHED SUCCESSFULLY'));
        }
        done(error);
      });
  });
};


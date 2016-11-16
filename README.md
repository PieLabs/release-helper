# release-helper 

A fairly opinionated release helper for gulp.

### Usage

```javascript
//gulpfile.js
const gulp = require('gulp'),
      releaseHelper = require('release-helper');

releaseHelper.init(gulp);
```

```shell
gulp release
gulp release --bump-type major|minor|patch # default: minor
gulp release --github-token XXXXXX #or export GITHUB_TOKEN 
```

### The release steps 

* ensure-clean - make sure the working tree is clean
* checkout-develop  
* pull-develop 
* checkout-master
* pull-master
* merge-develop - merge develop -> master using `-X theirs`
* strip-prerelease-version - change version from `x.x.x-prerelease` -> `x.x.x`
* commit-release-changes
* create-new-tag
* push-master
* github-release - push release to github using [conventional-github-releaser](https://github.com/conventional-changelog/conventional-github-releaser) - see below...
* checkout-develop
* bump-develop - bump the version and re-append `-prerelease`
* commit-bump-changes
* push-develop


### github release 
We release using the github releaser which will generate release notes from the commit log from messages that use the 
[angular commit conventions outlined here](https://github.com/conventional-changelog/conventional-changelog-angular/blob/master/convention.md). Note that the releaser doesn't pick up merge commits (need to fix that).
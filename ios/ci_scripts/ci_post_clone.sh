#!/bin/sh
#
# Xcode Cloud runs this immediately after cloning, before the build.
#
# Location matters: Apple only looks for ci_scripts/ in the same directory as
# the .xcodeproj / .xcworkspace, which is why this lives in ios/ rather than at
# the repository root. It must also stay executable — a non-executable script
# is skipped silently, with nothing to tell you why the build failed later.
#
# The repository deliberately does not track node_modules/ or ios/Pods/: they
# are large, generated, and reproducible from the lockfiles. This restores
# them. It also regenerates ios/.xcode.env.local, which is gitignored because
# it holds an absolute path to the node binary on whichever machine ran
# prebuild — hardcoding one developer's path breaks every other machine.

set -e

echo "─── Node ───"
if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
echo "node $(node --version)"

echo "─── JS dependencies ───"
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci

echo "─── Point Xcode's build phases at this runner's node ───"
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
cat ios/.xcode.env.local

echo "─── CocoaPods ───"
# LANG must be a UTF-8 locale or CocoaPods dies inside Ruby's unicode_normalize
# with "Unicode Normalization not appropriate for ASCII-8BIT".
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
cd ios
pod install

echo "─── Ready ───"

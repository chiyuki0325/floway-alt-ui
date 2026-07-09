#!/usr/bin/env sh
set -eu

git submodule update --init --recursive vendor/floway
pnpm install

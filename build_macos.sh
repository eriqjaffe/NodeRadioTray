#!/bin/sh
# Usage: ./build_macos.sh [arm64|x64|all]
# Defaults to arm64 (Apple Silicon).

set -e

ARCH="${1:-arm64}"

node package-macos.js --arch="$ARCH"

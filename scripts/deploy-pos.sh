#!/bin/bash
set -e

RELEASE_ID=$(date +%s)
WEB_ROOT=/var/www/highlands-motel
RELEASE_DIR=$WEB_ROOT/releases/$RELEASE_ID

echo "Creating release directory: $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "Extracting build..."
tar xzf /tmp/build.tar.gz -C "$RELEASE_DIR"

echo "Updating symlink..."
ln -sfn "$RELEASE_DIR" "$WEB_ROOT/current_new"
mv -T "$WEB_ROOT/current_new" "$WEB_ROOT/current"

echo "Cleaning up old releases (keeping last 5)..."
ls -1 "$WEB_ROOT/releases/" | sort | head -n -5 | while read dir; do
  rm -rf "$WEB_ROOT/releases/$dir"
done

rm -f /tmp/build.tar.gz
echo "Deployment complete: $RELEASE_ID"

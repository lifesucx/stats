#!/usr/bin/bash
set -e
CONTAINER=ariovistus/chrome-node
WORKDIR="-v $(pwd):/usr/src/app:z -u $(id -u):$(id -g)"

docker run $WORKDIR --rm --entrypoint yarn $CONTAINER install
docker run $WORKDIR --rm --entrypoint npm $CONTAINER rebuild node-sass



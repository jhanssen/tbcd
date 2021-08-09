#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "${SCRIPT_DIR}/.."

COM="$2"
if [ -z "$COM" ]; then
   COM="/dev/ttyACM0"
fi
PORT="$2"
if [ -z "$PORT" ]; then
    PORT="8080"
fi

case "$1" in
    backend)
        cd backend
        node build/main/index.js --com-port "$COM"
        ;;
    web)
        cd web/dist/web
        http-server . -p $PORT
        ;;
    socat)
        sudo socat TCP4-LISTEN:www,reuseaddr,fork TCP4:localhost:$PORT
        ;;
    *)
        echo "unknown command $1"
        ;;
esac

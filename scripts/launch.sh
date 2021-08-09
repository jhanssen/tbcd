#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "${SCRIPT_DIR}/.."

COM="$2"
if [ -z "$COM" ]; then
   COM="/dev/ttyACM0"
fi

case "$1" in
    backend)
        cd backend
        node build/main/index.js --com-port "$COM"
        ;;
    web)
        cd web/dist/web
        http-server .
        ;;
    socat)
        sudo socat TCP4-LISTEN:www,reuseaddr,fork TCP4:localhost:8080
        ;;
    *)
        echo "unknown command $1"
        ;;
esac

#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "${SCRIPT_DIR}/.."

IDECOM="$2"
PCCOM="$3"
QUEUEPIN="-1"
case "${IDECOM#-}" in
    ''|*[!0-9]*) ;;
    *) QUEUEPIN="$IDECOM"; IDECOM="" ;;
esac
if [ -z "$IDECOM" ]; then
    IDECOM="$3"
    PCCOM="$4"
fi
if [ -z "$IDECOM" ]; then
    IDECOM="/dev/ttyACM0"
fi
if [ -z "$PCCOM" ]; then
    PCCOM="/dev/ttyUSB0"
fi

PORT="$2"
if [ -z "$PORT" ]; then
    PORT="8080"
fi

case "$1" in
    backend)
        cd backend
        node build/main/index.js --ide-com-port "$IDECOM" --pc-com-port "$PCCOM" --queue-button-pin "$QUEUEPIN"
        ;;
    web)
        cd web/dist/web
        http-server . -p $PORT -P "http://localhost:${PORT}?"
        ;;
    socat)
        sudo socat TCP4-LISTEN:www,reuseaddr,fork TCP4:localhost:$PORT
        ;;
    *)
        echo "unknown command $1"
        ;;
esac

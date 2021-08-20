import { API, getAPI } from "./api";
import assert from "./assert";
import rpio from "rpio";
import EventEmitter from "events";

export interface QueueOptions {
    ideComPort: string;
    queueButtonPin: number;
    longPressMs: number;
}

export class Queue extends EventEmitter {
    private _currentFile?: string;
    private _buttonPressed?: number;
    private _queue: string[];
    private _api: API;
    private _queueButtonPin: number;
    private _longPressMs: number;

    constructor(api: API, queueButtonPin: number, longPressMs: number) {
        super();

        this._queue = [];
        this._api = api;
        this._queueButtonPin = queueButtonPin;
        this._longPressMs = longPressMs;

        api.on("currentFile", (file?: string) => {
            if (queue !== undefined)
                this._currentFile = file;
        });

        api.getCurrentFile().then((file?: string) => {
            this._currentFile = file;
        }).catch((e: Error) => {
            console.error("error getting currentFile for queue", e.message);
        });
    }

    public get currentFile() {
        return this._currentFile;
    }

    public set currentFile(file: string|undefined) {
        this._currentFile = file;
    }

    public queue() {
        return this._queue;
    }

    public setQueue(queue: string[]) {
        this._queue = queue;
        this.emit("changed");
    }

    public prev(): Error|undefined {
        if (this._queue.length === 0) {
            return new Error("queue is empty");
        }
        // find currentfile in queue
        let prev: number;
        if (this._currentFile === undefined) {
            prev = this._queue.length - 1;
        } else {
            prev = this._queue.indexOf(this._currentFile);
            if (prev === -1) {
                return new Error(`current file ${this._currentFile} is not in queue`);
            }
            if (--prev < 0)
                prev = this._queue.length - 1;
        }
        this._api.selectFile(this._queue[prev]);
        return undefined;
    }

    public next(): Error|undefined {
        if (this._queue.length === 0) {
            return new Error("queue is empty");
        }
        // find currentfile in queue
        let next: number;
        if (this._currentFile === undefined) {
            next = 0;
        } else {
            next = this._queue.indexOf(this._currentFile);
            if (next === -1) {
                return new Error(`current file ${this._currentFile} is not in queue`);
            }
            if (++next >= this._queue.length)
                next = 0;
        }
        this._api.selectFile(this._queue[next]);
        return undefined;
    }

    public handleQueuePin() {
        const pressed = rpio.read(this._queueButtonPin) !== 1;
        if (pressed && this._buttonPressed === undefined) {
            this._buttonPressed = Date.now();
        } else if (!pressed && this._buttonPressed !== undefined) {
            // short press or long press
            let e: Error | undefined;
            if (Date.now() - this._buttonPressed >= this._longPressMs) {
                // long press, move backward in queue
                console.log("long press");
                e = this.prev();
            } else {
                // short press, move forward in queue
                console.log("short press");
                e = this.next();
            }
            if (e !== undefined) {
                console.error("queue error", e.message);
            }
            this._buttonPressed = undefined;
        }
    }
}

let queue: Queue | undefined;

export async function initialize(opts: QueueOptions) {
    const api = getAPI(opts.ideComPort);
    queue = new Queue(api, opts.queueButtonPin, opts.longPressMs);

    // setup gpio
    if (opts.queueButtonPin >= 0) {
        rpio.open(opts.queueButtonPin, rpio.INPUT, rpio.PULL_UP);
        rpio.poll(opts.queueButtonPin, (pin: number) => {
            switch (pin) {
            case opts.queueButtonPin:
                assert(queue, "queue can't be undefined");
                queue.handleQueuePin();
                break;
            default:
                console.error(`unhandled pin: ${pin}`);
                break;
            }
        });
    }
}

export function getQueue(): Queue {
    if (queue === undefined) {
        throw new Error("queue not initialized");
    }
    return queue;
}

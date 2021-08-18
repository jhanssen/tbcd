import { getAPI } from "./api";
import assert from "./assert";
import rpio from "rpio";

export interface QueueOptions {
    comPort: string;
    queueButtonPin: number;
    longPressMs: number;
}

export interface Queue {
    currentFile?: string;
    queue: string[];
    buttonPressed?: number;
    prev: () => Error|undefined;
    next: () => Error|undefined;
};

let queue: Queue | undefined;

export async function initialize(opts: QueueOptions) {
    const api = getAPI(opts.comPort);

    queue = {
        queue: [],
        prev: () => {
            assert(queue, "queue can't be undefined");
            if (queue.queue.length === 0) {
                return new Error("queue is empty");
            }
            // find currentfile in queue
            let prev: number;
            if (queue.currentFile === undefined) {
                prev = queue.queue.length - 1;
            } else {
                prev = queue.queue.indexOf(queue.currentFile);
                if (prev === -1) {
                    return new Error(`current file ${queue.currentFile} is not in queue`);
                }
                if (--prev < 0)
                    prev = queue.queue.length - 1;
            }
            api.selectFile(queue.queue[prev]);
            return undefined;
        },
        next: () => {
            assert(queue, "queue can't be undefined");
            if (queue.queue.length === 0) {
                return new Error("queue is empty");
            }
            // find currentfile in queue
            let next: number;
            if (queue.currentFile === undefined) {
                next = 0;
            } else {
                next = queue.queue.indexOf(queue.currentFile);
                if (next === -1) {
                    return new Error(`current file ${queue.currentFile} is not in queue`);
                }
                if (++next >= queue.queue.length)
                    next = 0;
            }
            api.selectFile(queue.queue[next]);
            return undefined;
        }
    };

    const handleQueuePin = () => {
        assert(queue, "queue can't be undefined");
        const pressed = rpio.read(opts.queueButtonPin) !== 1;
        if (pressed && queue.buttonPressed === undefined) {
            queue.buttonPressed = Date.now();
        } else if (!pressed && queue.buttonPressed !== undefined) {
            // short press or long press
            let e: Error | undefined;
            if (Date.now() - queue.buttonPressed >= opts.longPressMs) {
                // long press, move backward in queue
                console.log("long press");
                e = queue.prev();
            } else {
                // short press, move forward in queue
                console.log("short press");
                e = queue.next();
            }
            if (e !== undefined) {
                console.error("queue error", e.message);
            }
            queue.buttonPressed = undefined;
        }
    };

    // setup gpio
    if (opts.queueButtonPin >= 0) {
        rpio.open(opts.queueButtonPin, rpio.INPUT, rpio.PULL_UP);
        rpio.poll(opts.queueButtonPin, (pin: number) => {
            switch (pin) {
            case opts.queueButtonPin:
                handleQueuePin();
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

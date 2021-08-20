import { getAPI, getStatus } from "./index";
import { API } from "./common";
import { APIStatus } from "./status";
import { readDataFile } from "../file";
import { Queue, getQueue } from "../queue";
import assert from "../assert";
import SerialPort from "serialport";

interface SPAPIOptions {
    writeDir: string;
    ideComPort: string;
    pcComPort: string;
    pcComBps: number;
}

let dataBuffer: Buffer|undefined = undefined;
let dataOffset = 0;

let pendingQueue: string[]|undefined;
let pendingQueueSize = 0;

function zero(str: string) {
    const b = Buffer.alloc(str.length + 1, 0);
    b.write(str); //, 0, str.length);
    return b;
}

function nameOf(n: string) {
    const slash = n.lastIndexOf("/");
    if (slash === -1)
        return n;
    return n.substr(slash + 1);
}

interface ProcessOptions {
    api: API;
    queue: Queue;
    apiStatus: APIStatus,
    writeDir: string;
    port: SerialPort;
}

function sendQueue(port: SerialPort, api: API, queue: string[]) {
    if (queue.length === 0) {
        const qlen = Buffer.alloc(4);
        qlen.write("qu", 0, 2);
        port.write(qlen);
    } else {
        api.getImages().then(imgs => {
            const q = queue.map(e => {
                for (const i of imgs) {
                    if (i.name === e)
                        return i.sha1;
                }
                return undefined;
            }).filter(e => e !== undefined);
            const qlen = Buffer.alloc(4);
            qlen.write("qu", 0, 2);
            qlen.writeUInt16LE(q.length, 2);
            port.write(qlen);
            for (const qi of q) {
                assert(typeof qi === "string");
                port.write(zero(qi));
            }
        }).catch((e: Error) => { throw e });
    }
}

function processData(opts: ProcessOptions, data: Buffer) {
    const len = Buffer.byteLength(data);
    assert(dataOffset <= len);

    // read queue items if we need more
    if (pendingQueue && pendingQueue.length < pendingQueueSize) {
        // scan for 0 terminate
        const z1 = data.indexOf(0, dataOffset);
        if (z1 === -1)
            return 0;
        // grab the sha1
        const sha1 = data.toString("ascii", dataOffset, z1);
        pendingQueue.push(sha1);

        if (pendingQueue.length === pendingQueueSize) {
            // got the entire queue, now make the queue be image names
            const actualQueue = pendingQueue;
            pendingQueue = undefined;
            pendingQueueSize = 0;

            opts.api.getImages().then(imgs => {
                const q = actualQueue.map(e => {
                    for (const i of imgs) {
                        if (i.sha1 === e)
                            return i.name;
                    }
                    return undefined;
                }).filter(e => e !== undefined);

                console.log("setting queue from dos", q);
                opts.queue.setQueue(q as string[]);
            }).catch((e: Error) => { console.error("error getting images for dos queue update", e.message); });
        }
    }

    if (len - dataOffset < 3)
        return 0;
    switch (data.toString("ascii", dataOffset, dataOffset + 2)) {
    case "it": {
        if (data[2] !== 0) {
            console.error("invalid item message");
            return -1;
        }
        console.log("dos wants items");
        // items
        opts.api.getImages().then(imgs => {
            const reads = [];
            for (let i of imgs) {
                reads.push(readDataFile(opts.writeDir, `${i.sha1}.txt`, "ascii"));
            }
            Promise.allSettled(reads).then(names => {
                const rnames = names.map(n => {
                    switch (n.status) {
                    case "fulfilled":
                        return n.value as string;
                    default:
                        break;
                    }
                    return undefined;
                });
                if (rnames.length !== imgs.length) {
                    throw new Error(`name length mismatch ${rnames.length} {imgs.length}`);
                }
                for (let i = 0; i < imgs.length; ++i) {
                    // write sha1, name
                    opts.port.write("it");
                    opts.port.write(zero(imgs[i].sha1));
                    opts.port.write(zero(rnames[i] || nameOf(imgs[i].name)));
                }
            }).catch((e: Error) => { throw e; });
        }).catch((e: Error) => { console.error("api getImages error", e.message); });
        return 3; }
    case "ci": {
        // current item
        if (data[2] === 0) {
            console.log("dos wants current item");
            // get current item
            opts.api.getCurrentSha1().then(file => {
                opts.port.write(zero(`ci${file || ""}`));
            }).catch((e: Error) => { console.error("api getCurrentSha1 error", e.message); });
            return 3;
        }
        // set current item
        // scan for 0 terminate
        const z1 = data.indexOf(0, dataOffset + 2);
        if (z1 === -1)
            return 0;
        // grab the sha1
        const sha1 = data.toString("ascii", dataOffset + 2, z1);
        console.log(`dos wants to set current item ${sha1}`);
        try {
            opts.api.selectFile(sha1, true);
        } catch (e) {
            console.error("api selectFile error", e.message);
        }
        return (z1 + 1) - dataOffset; }
    case "im": {
        // scan for 0 terminate
        const z1 = data.indexOf(0, dataOffset + 2);
        if (z1 === -1)
            return 0;
        // grab the sha1
        const sha1 = data.toString("ascii", dataOffset + 2, z1);
        console.log(`dos wants image for ${sha1}`);
        readDataFile(opts.writeDir, `${sha1}.gif`).then((data: Buffer|string) => {
            assert(typeof data !== "string", "data has to be buffer");
            const imglen = Buffer.alloc(4);
            imglen.write("im", 0, 2);
            imglen.writeUInt16LE(Buffer.byteLength(data), 2);
            assert(imglen !== undefined && data !== undefined, "imglen and data can't be undefined");
            opts.port.write(imglen);
            opts.port.write(data);
        }).catch((e: Error) => { console.error("api read image error", e.message); });
        return (z1 + 1) - dataOffset; }
    case "qr": {
        console.log("dos wants queue");
        sendQueue(opts.port, opts.api, opts.queue.queue());
        return 3; }
    case "qs": {
        if (len - dataOffset < 4)
            return 0;
        pendingQueueSize = data.readUInt16LE(dataOffset + 2);
        console.log("dos wants to set queue", pendingQueueSize);
        if (pendingQueueSize > 0) {
            pendingQueue = [];
        } else {
            // clear queue
            opts.queue.setQueue([]);
        }
        return 4; }
    default:
        console.error(`unhandled dos message ${data.toString("ascii", dataOffset, dataOffset + 2)} at ${dataOffset}`);
        break;
    }
    return -1;
}

export async function initialize(opts: SPAPIOptions) {
    const api = getAPI(opts.ideComPort);
    const apiStatus = getStatus();

    const port = new SerialPort(opts.pcComPort, {
        baudRate: opts.pcComBps,
        rtscts: true
    }, (err?: Error | null) => {
        if (err) {
            console.error("pc com port open error", err.message);
        }
    });

    const queue = getQueue();

    const processOpts: ProcessOptions = {
        api,
        queue,
        port,
        apiStatus,
        writeDir: opts.writeDir
    };

    port.on("error", e => {
        console.error("pc com port error", e.message);
        port.close();
    });
    port.on("close", () => {
        console.error("pc com port close");
    });
    port.on("data", (data: Buffer) => {
        if (dataBuffer) {
            dataBuffer = Buffer.concat([dataBuffer, data]);
        } else {
            dataBuffer = data;
        }
        let processed: number;
        for (;;) {
            processed = processData(processOpts, dataBuffer);
            if (processed === -1 || dataOffset + processed === Buffer.byteLength(dataBuffer)) {
                dataOffset = 0;
                dataBuffer = undefined;
                console.log("clearing buffer");
                break;
            } else if (processed === 0) {
                // nothing to do
                break;
            } else {
                dataOffset += processed
            }
        }
    });
    api.on("currentSha1", (sha1: string|undefined) => {
        port.write(zero(`ci${sha1 || ""}`));
    });
    queue.on("changed", () => {
        sendQueue(port, api, queue.queue());
    });
}

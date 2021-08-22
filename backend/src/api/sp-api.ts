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

function crc16(buf: string|Buffer, old?: number) {
    let x;
    let crc = old ? old : 0xFFFF;
    let idx = 0;

    const bf = (typeof buf === "string") ? Buffer.from(buf, "ascii") : buf;
    let length = Buffer.byteLength(bf);
    while (length--) {
        x = crc >> 8 ^ bf[idx++];
        x ^= x >> 4;
        crc = ((crc << 8) & 0xffff) ^ ((x << 12) & 0xffff) ^ ((x << 5) & 0xffff) ^ (x & 0xffff);
    }
    return crc;
}

const enum Constants {
    Timeout = 60000,
    CheckTimeout = 60000
};

class Message {
    private _slices?: number[];
    private _message?: Buffer;
    private _id: number;
    private _sent: number;
    private _currentPart: number;
    private _sliceSize: number;

    constructor(id: number, slice: number) {
        this._id = id;
        this._sent = Date.now();
        this._currentPart = 0;
        this._sliceSize = slice;
    }

    get id() { return this._id; }
    get length() { if (!this._slices) throw new Error("length, no slices"); return this._slices.length; }
    get finished() { if (!this._slices) throw new Error("finished, no slices"); return this._currentPart === this._slices.length; }

    write(buf: Buffer|string) {
        if (this._slices !== undefined) {
            throw new Error(`message already finalized`);
        }
        const b = (typeof buf === "string") ? Buffer.from(buf, "ascii") : buf;
        if (this._message === undefined) {
            this._message = b;
        } else {
            this._message = Buffer.concat([this._message, b]);
        }
    }

    send(port: SerialPort) {
        console.log("wanting to send msg");
        if (!this._message)
            return;
        if (!this._slices) {
            this._slices = [];
            const len = Buffer.byteLength(this._message);
            for (let i = 0; i < len; i += this._sliceSize) {
                this._slices.push(i);
            }
        }
        const header = Buffer.alloc(6);
        header.writeUInt16LE(this._id, 0);
        header.writeUInt16LE(this._slices.length, 2)
        header.writeUInt16LE(crc16(header.slice(0, 4)), 4);
        console.log("writing all", header);
        port.write(header);

        // send the first part
        this._sendOne(port, this._currentPart);
    }

    resendPart(port: SerialPort, no: number) {
        console.log("wanting to resend part", no);
        if (!this._slices) {
            console.error("no slices, call write()?");
            return;
        }
        if (no >= this._slices.length) {
            console.error("part no out of range");
            return;
        }
        this._currentPart = no;
        this._sendOne(port, this._currentPart);
    }

    partCompleted(port: SerialPort, no: number): boolean {
        console.log("wanting to complete part", no);
        if (!this._slices) {
            console.error("no slices, call write()?");
            return false;
        }
        if (no !== this._currentPart) {
            console.error("part is not our current part", no, this._currentPart);
            return false;
        }
        this._currentPart = no + 1;
        if (this._currentPart < this._slices.length) {
            this._sendOne(port, this._currentPart);
            return false;
        } else {
            // message complete
            this._slices = undefined;
            this._message = undefined;
            return true;
        }
    }

    hasTimedout(now: number) {
        return now - this._sent >= Constants.Timeout;
    }

    private _sendOne(port: SerialPort, idx: number) {
        assert(this._slices !== undefined, "slices can't be undefined");
        assert(idx < this._slices.length, "idx has to be less than length");
        assert(this._message !== undefined, "message can't be undefined here");
        const off = this._slices[idx];
        const end = idx + 1 < this._slices.length ? this._slices[idx + 1] : undefined;
        const buf = this._message.slice(off, end);
        const header = Buffer.alloc(4);
        header.writeUInt16LE(Buffer.byteLength(buf), 0);
        header.writeUInt16LE(crc16(buf), 2);
        port.write(header);
        port.write(buf);
    }
}

interface ProcessOptions {
    api: API;
    queue: Queue;
    apiStatus: APIStatus,
    writeDir: string;
    port: SerialPort;
    messages: Message[];
    bps: number;
    currentMessage: number;
    nextMessage: number;
}

function allocMessage(opts: ProcessOptions) {
    const id = opts.nextMessage;
    // 65535 is reserved
    if (++opts.nextMessage === 65535) {
        // wrap at uint16 max
        opts.nextMessage = 0;
    }
    const slice = Math.floor(opts.bps / 50);
    const msg = new Message(id, slice);
    console.log("allocing message", id, "at", opts.messages.length);
    opts.messages.push(msg);
    if (opts.messages.length === 1) {
        opts.currentMessage = 0;
    }
    return msg;
}

function sendMessage(opts: ProcessOptions, msg: Message) {
    const idx = opts.messages.indexOf(msg);
    if (idx === -1) {
        // shouldn't happen
        console.error("message not found in messages");
        return;
    }
    if (idx === opts.currentMessage) {
        console.log("sendMessage", msg.id);
        msg.send(opts.port);
    }
}

function sendQueue(opts: ProcessOptions) {
    const api = opts.api;
    const queue = opts.queue.queue();
    if (queue.length === 0) {
        const qlen = Buffer.alloc(4);
        qlen.write("qu", 0, 2);
        const msg = allocMessage(opts);
        msg.write(qlen);
        sendMessage(opts, msg);
    } else {
        api.getImages().then(imgs => {
            const q = queue.map(e => {
                for (const i of imgs) {
                    if (i.name === e)
                        return i.sha1;
                }
                return undefined;
            }).filter(e => e !== undefined);
            let qbuf = Buffer.alloc(4);
            qbuf.write("qu", 0, 2);
            qbuf.writeUInt16LE(q.length, 2);
            const qbs = q.map((e: string|undefined) => {
                assert(typeof e === "string");
                return zero(e);
            });
            qbuf = Buffer.concat([qbuf, ...qbs]);
            const msg = allocMessage(opts);
            msg.write(qbuf);
            sendMessage(opts, msg);
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
        return (z1 + 1) - dataOffset;
    }

    if (len - dataOffset < 3)
        return 0;
    switch (data.toString("ascii", dataOffset, dataOffset + 2)) {
    case "it": {
        if (data[dataOffset + 2] !== 0) {
            console.error("invalid item message");
            return -1;
        }
        console.log("dos wants items");
        // items, assume this is the first message
        opts.messages = [];
        opts.currentMessage = -1;
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
                    const msg = allocMessage(opts);
                    msg.write("it");
                    msg.write(zero(imgs[i].sha1));
                    msg.write(zero(rnames[i] || nameOf(imgs[i].name)));
                    sendMessage(opts, msg);
                }
            }).catch((e: Error) => { throw e; });
        }).catch((e: Error) => { console.error("api getImages error", e.message); });
        return 3; }
    case "ci": {
        // current item
        if (data[dataOffset + 2] === 0) {
            console.log("dos wants current item");
            // get current item
            opts.api.getCurrentSha1().then(file => {
                const msg = allocMessage(opts);
                msg.write(zero(`ci${file || ""}`));
                sendMessage(opts, msg);
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
            const msg = allocMessage(opts);
            msg.write(imglen);
            msg.write(data);
            sendMessage(opts, msg);
        }).catch((e: Error) => { console.error("api read image error", e.message); });
        return (z1 + 1) - dataOffset; }
    case "qr": {
        console.log("dos wants queue");
        sendQueue(opts);
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
    case "bd": {
        // done with buffer slice
        if (len - dataOffset < 6)
            return 0;
        const bufid = data.readUInt16LE(dataOffset + 2);
        // if bufid is not our current message then drop this
        const currentMessage = opts.messages[opts.currentMessage];
        if (currentMessage === undefined || bufid !== currentMessage.id) {
            console.log("was told about completed slice for non-current message", bufid, opts.currentMessage);
            return 6;
        }
        const sliceno = data.readUInt16LE(dataOffset + 4);
        // find bufno in buffers
        const bufidx = opts.messages.findIndex((e: Message) => e.id === bufid);
        if (bufidx !== -1) {
            const msg = opts.messages[bufidx];
            if (msg.partCompleted(opts.port, sliceno)) {
                // whole message is done
                console.log(`buffer done ${bufid}`);
                opts.messages.splice(opts.currentMessage, 1);
                if (opts.currentMessage < opts.messages.length) {
                    // start on the next pending message
                    const nmsg = opts.messages[opts.currentMessage];
                    console.log("sendNewMessage", nmsg.id, opts.currentMessage);
                    nmsg.send(opts.port);
                }
            }
        }
        return 6; }
    case "br": {
        // resend message slice
        if (len - dataOffset < 6)
            return 0;
        const bufid = data.readUInt16LE(dataOffset + 2);
        // if bufid is not our current message then drop this
        const currentMessage = opts.messages[opts.currentMessage];
        if (currentMessage === undefined || bufid !== currentMessage.id) {
            console.log("was asked to resend slice for non-current message", bufid, opts.currentMessage, currentMessage ? currentMessage.id : undefined);
            return 6;
        }
        const sliceno = data.readUInt16LE(dataOffset + 4);
        // find bufno in buffers
        const msg = opts.messages.find((e: Message) => e.id === bufid);
        if (msg !== undefined) {
            if (sliceno === 0xffff) {
                // resend the full message
                console.log("resendMessage", msg.id);
                msg.send(opts.port);
            } else {
                // resend a particular slice
                msg.resendPart(opts.port, sliceno);
            }
            console.log(`resent ${bufid} slice ${sliceno}`);
        } else {
            console.error(`wanted resend of ${bufid} slice ${sliceno} but no message found`);
        }
        return 6; }
    case "ba": {
        // update baud rate
        if (len - dataOffset < 6)
            return 0;
        const bps = data.readUInt32LE(dataOffset + 2);
        const valid = [9600, 19200, 38400, 57600, 115200];
        if (valid.indexOf(bps) === -1) {
            console.log("invalid bps", bps);
        } else {
            console.log("updating bps", bps);
            opts.port.update({ baudRate: bps });
            opts.bps = bps;
        }
        return 6; }
    default:
        console.error(`unhandled dos message ${data.toString("ascii", dataOffset, dataOffset + 2)} at ${dataOffset}`);
        // go back to 9600
        console.log("going back to 9600");
        opts.port.update({ baudRate: 9600 });
        opts.bps = 9600;
        opts.messages = [];
        opts.currentMessage = -1;
        break;
    }
    return -1;
}

export async function initialize(opts: SPAPIOptions) {
    const api = getAPI(opts.ideComPort);
    const apiStatus = getStatus();

    const port = new SerialPort(opts.pcComPort, {
        baudRate: 9600
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
        writeDir: opts.writeDir,
        messages: [],
        bps: 9600,
        currentMessage: -1,
        nextMessage: 0
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
        const msg = allocMessage(processOpts);
        msg.write(zero(`ci${sha1 || ""}`));
        sendMessage(processOpts, msg);
    });
    queue.on("changed", () => {
        sendQueue(processOpts);
    });

    // check message timeouts
    setInterval(() => {
        let idx = 0;
        let len = processOpts.messages.length;
        const now = Date.now();
        while (idx < len) {
            const msg = processOpts.messages[idx];
            if (msg.hasTimedout(now)) {
                // timed out, remove
                processOpts.messages.splice(idx, 1);
                --len;
            } else {
                ++idx;
            }
        }
    }, Constants.CheckTimeout);
}

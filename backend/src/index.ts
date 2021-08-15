import Options from "@jhanssen/options";
import WebSocket from "ws";
import rpio from "rpio";
import xdg from "xdg-basedir";
import mkdirp from "mkdirp";
import fetch from "node-fetch";
import { API } from "./api";
import { encodeTga, encodePng } from "./image";
import { decrypt } from "./decrypt";
import assert from "./assert";
import fs from "fs/promises";
import path from "path";

const options = Options({ prefix: "tbcd" });
const WebSocketServer = WebSocket.Server;

const comPort = options("com-port");
if (typeof comPort !== "string") {
    console.error("invalid port name", comPort);
    process.exit(1);
}
const wsPort = options.int("ws-port", 8089);
const wsPingInterval = options.int("ws-ping-interval", 60000);

const queueButtonPin = options.int("queue-button-pin", -1);
const longPressMs = options.int("queue-button-long-press", 1500);

const writeDir = options("write-dir", path.join(xdg.data || "/", "tbcd"));
if (typeof writeDir !== "string" || writeDir.indexOf("/tbcd") === 0) {
    console.log("invalid writeDir, no xdgData?", writeDir);
    process.exit(1);
}

async function writeDataFile(file: string, data: Buffer|string, encoding?: BufferEncoding) {
    assert(typeof writeDir === "string", "writeDir must be string");
    await fs.writeFile(path.join(writeDir, file), data, { encoding: encoding ? encoding : null });
}

async function readDataFile(file: string, encoding?: BufferEncoding) {
    assert(typeof writeDir === "string", "writeDir must be string");
    return await fs.readFile(path.join(writeDir, file), { encoding: encoding ? encoding : null });
}

async function unlinkDataFile(file: string) {
    assert(typeof writeDir === "string", "writeDir must be string");
    await fs.unlink(path.join(writeDir, file));
}

interface Ping {
    ws: WebSocket;
    received: boolean;
}

(async function() {
    try {
        console.log("writeDir", writeDir);
        await mkdirp(writeDir);
    } catch (e) {
        console.error("error making writeDir", e);
        process.exit(1);
    }

    const apiStatus: {
        error?: Error;
        open: boolean;
    } = {
        open: false
    };

    const queue: {
        currentFile?: string;
        queue: string[];
        buttonPressed?: number;
        prev: () => Error|undefined;
        next: () => Error|undefined;
    } = {
        queue: [],
        prev: () => {
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
        const pressed = rpio.read(queueButtonPin) !== 1;
        if (pressed && queue.buttonPressed === undefined) {
            queue.buttonPressed = Date.now();
        } else if (!pressed && queue.buttonPressed !== undefined) {
            // short press or long press
            let e: Error | undefined;
            if (Date.now() - queue.buttonPressed >= longPressMs) {
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
    if (queueButtonPin >= 0) {
        rpio.open(queueButtonPin, rpio.INPUT, rpio.PULL_UP);
        rpio.poll(queueButtonPin, (pin: number) => {
            switch (pin) {
            case queueButtonPin:
                handleQueuePin();
                break;
            default:
                console.error(`unhandled pin: ${pin}`);
                break;
            }
        });
    }

    const pings: Ping[] = [];

    const findPing = (ws: WebSocket) => {
        for (let i = 0; i < pings.length; ++i) {
            if (pings[i].ws === ws) {
                return pings[i];
            }
        }
        return undefined;
    };

    const removePing = (ws: WebSocket) => {
        for (let i = 0; i < pings.length; ++i) {
            if (pings[i].ws === ws) {
                pings.splice(i, 1);
                return;
            }
        }
    };

    const api = new API(comPort);
    api.on("open", () => {
        apiStatus.open = true;
        apiStatus.error = undefined;
    });
    api.on("close", () => {
        apiStatus.open = false;
    });
    api.on("error", (e: Error) => {
        apiStatus.open = false;
        apiStatus.error = e;
    });

    const wssv1 = new WebSocketServer({ port: wsPort, path: "/api/v1" });

    const interval = setInterval(function ping() {
        for (let i = 0; i < pings.length; ++i) {
            if (!pings[i].received) {
                console.log("pong not received in time, removing ws");
                pings[i].ws.terminate();
                removePing(pings[i].ws);
            } else {
                try {
                    pings[i].received = false;
                    pings[i].ws.send(JSON.stringify({ type: "ping" }));
                } catch (e) {
                    console.error("ping send error", e);
                    pings[i].ws.terminate();
                    removePing(pings[i].ws);
                }
            }
        }
    }, wsPingInterval);

    wssv1.on("close", () => {
        clearInterval(interval);
    });

    console.log(`listening on ws: ${wsPort}`);
    wssv1.on("connection", ws => {
        pings.push({ ws, received: true });

        const send = (type: string, id: number | undefined, msg?: any) => {
            try {
                ws.send(JSON.stringify({ type: type, id: id, data: msg }));
            } catch (e) {
                console.error("send error", type, e);
            }
        };

        const error = (type: string, id: number | undefined, err: string) => {
            send("error", id, { "errorType": type, "error": err });
        };

        const currentFileSender = (file?: string) => {
            queue.currentFile = file ? file : undefined;
            send("currentFile", undefined, queue.currentFile);
        };
        const openSender = () => {
            send("open", undefined);
        };
        const closeSender = () => {
            send("close", undefined);
        };
        const errorSender = (err: Error) => {
            send("error", undefined, err.message);
        };
        api.on("currentFile", currentFileSender);
        api.on("open", openSender);
        api.on("close", closeSender);
        api.on("error", errorSender);

        ws.on("close", () => {
            api.off("currentFile", currentFileSender);
            api.off("open", openSender);
            api.off("close", closeSender);
            api.off("error", errorSender);

            removePing(ws);
        });

        // send an initialize message
        send("initialize", undefined, { wsPingInterval });

        if (apiStatus.open) {
            send("open", undefined);
        } else {
            if (apiStatus.error) {
                send("error", undefined, apiStatus.error.message);
            }
            send("close", undefined);
        }

        ws.on("message", msg => {
            // console.log("msg", msg.toString());
            try {
                const d = JSON.parse(msg.toString());
                const id = d.id;
                if (typeof id !== "number" && id !== undefined) {
                    throw new Error(`invalid id: ${typeof id}`);
                }
                switch (d.type) {
                case "images":
                    api.getImages().then(imgs => {
                        send("images", id, imgs);
                    }).catch(e => { throw e; });
                    break;
                case "setQueue":
                    // verify that the queue is a queue
                    if (d.data instanceof Array) {
                        let invalidItem: string | undefined = undefined;
                        const q = d.data.filter((item: any) => {
                            if (item === undefined)
                                return false;
                            else if (typeof item === "string")
                                return true;
                            invalidItem = typeof item;
                            return false;
                        });
                        if (invalidItem) {
                            error("setQueue", id, `invalid item in queue: ${invalidItem}`);
                        } else {
                            console.log("setting queue", q);
                            queue.queue = q;
                            if (q.length > 0 && queue.currentFile !== q[0]) {
                                queue.currentFile = q[0];
                                assert(queue.currentFile !== undefined, "can't be undefined");
                                api.selectFile(queue.currentFile);
                            }
                            send("setQueue", id);
                        }
                    }
                    break;
                case "queue":
                    send("queue", id, queue.queue);
                    break;
                case "queuePrev": {
                    const ret = queue.prev();
                    if (ret !== undefined) {
                        error("queuePrev", id, ret.message);
                    }
                    break; }
                case "queueNext": {
                    const ret = queue.next();
                    if (ret !== undefined) {
                        error("queueNext", id, ret.message);
                    }
                    break; }
                case "currentFile":
                    api.getCurrentFile().then(file => {
                        send("currentFile", id, file ? file : undefined);
                    }).catch(e => { throw e; });
                    break;
                case "setCurrentFile":
                    if (typeof d.data === "object" && typeof d.data.file === "string") {
                        api.selectFile(d.data.file);
                    } else if (d.data === undefined) {
                        api.removeFile();
                    } else {
                        error("setCurrentFile", id, "need a file parameter");
                    }
                    break;
                case "name":
                    if (typeof d.data === "object" && typeof d.data.sha1 === "string") {
                        readDataFile(`${d.data.sha1}.txt`, "utf8").then((data: Buffer|string) => {
                            assert(typeof data === "string", "data must be a string");
                            send("name", id, data);
                        }).catch(e => {
                            error("name", id, e.message);
                        });
                    } else {
                        error("name", id, "need a sha1 parameter");
                    }
                    break;
                case "setName":
                    if (typeof d.data === "object" && typeof d.data.sha1 === "string") {
                        if (typeof d.data.name === "string") {
                            writeDataFile(`${d.data.sha1}.txt`, d.data.name, "utf8").then(() => {
                                send("setName", id, { sha1: d.data.sha1, name: d.data.name });
                            }).catch(e => {
                                error("setName", id, e.message);
                            });
                        } else {
                            unlinkDataFile(`${d.data.sha1}.txt`).then(() => {
                                send("setName", id, { sha1: d.data.sha1 });
                            }).catch(e => {
                                error("setName", id, e.message);
                            });
                        }
                    } else {
                        error("setName", id, "need a sha1 and name parameter");
                    }
                    break;
                case "bitmap":
                    if (typeof d.data === "object" && typeof d.data.sha1 === "string") {
                        let fn = d.data.sha1;
                        if (d.data.thumbnail === true) {
                            fn += ".thumb.png";
                        } else if (d.data.tga === true) {
                            fn += ".tga";
                        } else {
                            fn += ".png";
                        }
                        readDataFile(fn).then((data: Buffer|string) => {
                            assert(typeof data !== "string", "data should be a buffer");
                            send("bitmap", id, { sha1: d.data.sha1, small: d.data.small, data: data.toString("base64") });
                        }).catch(e => {
                            error("bitmap", id, e.message);
                        });
                    } else {
                        error("bitmap", id, "need a sha1 parameter");
                    }
                    break;
                case "setBitmap":
                    if (typeof d.data === "object" && typeof d.data.sha1 === "string" && typeof d.data.data === "string") {
                        // first, base64 decode data
                        try {
                            const data = Buffer.from(d.data.data, "base64");
                            // const tga = new TGA(data);
                            encodeTga(data, 100).then((buf: Buffer) => {
                                return writeDataFile(`${d.data.sha1}.tga`, buf);
                            }).then(() => {
                                return encodePng(data);
                            }).then((buf: Buffer) => {
                                return writeDataFile(`${d.data.sha1}.png`, buf);
                            }).then(() => {
                                return encodePng(data, 200);
                            }).then((buf: Buffer) => {
                                return writeDataFile(`${d.data.sha1}.thumb.png`, buf);
                            }).then(() => {
                                send("setBitmap", id, { sha1: d.data.sha1 });
                            }).catch(e => {
                                throw e;
                            });
                        } catch (e) {
                            error("setBitmap", id, e.message);
                        }
                    } else {
                        error("setBitmap", id, "need a sha1 and data parameter");
                    }
                    break;
                case "decrypt":
                    if (typeof d.data === "object" && typeof d.data.data === "string") {
                        try {
                            const decrypted = decrypt(d.data.data);
                            send("decrypt", id, { data: decrypted });
                        } catch (e) {
                            error("decrypt", id, e.message);
                        }
                    } else {
                        error("decrypt", id, "need a data parameter");
                    }
                    break;
                case "fetch":
                    if (typeof d.data === "object" && typeof d.data.url === "string") {
                        fetch(d.data.url).then(data => {
                            return data.arrayBuffer();
                        }).then(data => {
                            send("fetch", id, Buffer.from(data).toString(d.data.encoding || "base64"));
                        }).catch(e => {
                            error("fetch", id, e.message);
                        });
                    } else {
                        error("fetch", id, "need an url parameter");
                    }
                    break;
                case "ping":
                    send("pong", id);
                    break;
                case "pong":
                    const p = findPing(ws);
                    if (p === undefined) {
                        // should not happen
                        console.error("ping not found");
                        ws.close();
                    } else {
                        p.received = true;
                    }
                    break;
                }
            } catch (e) {
                console.error("message error", e);
                error("message", undefined, e.message);
            }
        });
    });
})().then(() => {}).catch(e => { console.error(e); process.exit(1); });

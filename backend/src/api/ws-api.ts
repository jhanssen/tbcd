import { getAPI, getStatus } from "./index";
import { writeDataFile, readDataFile, unlinkDataFile } from "../file";
import { encodeGif, encodePng } from "../image";
import { decrypt } from "../decrypt";
import { getQueue } from "../queue";
import assert from "../assert";
import fetch from "node-fetch";
import WebSocket from "ws";
import fs from "fs/promises";
import { constants as fsconstants } from "fs";
import path from "path";

const WebSocketServer = WebSocket.Server;

interface Ping {
    ws: WebSocket;
    received: boolean;
}

interface WSAPIOptions {
    writeDir: string;
    ideComPort: string;
    wsPort: number;
    wsPingInterval: number;
};

export async function initialize(opts: WSAPIOptions) {
    // find the convert binary
    let convpath: string|undefined;
    if (process.env.PATH !== undefined) {
        const paths = process.env.PATH.split(":");
        for (const p of paths) {
            const cur = path.join(p, "convert");
            fs.access(cur, fsconstants.R_OK | fsconstants.X_OK).then(() => {
                if (convpath === undefined) {
                    convpath = cur;
                    console.log("got path to convert", convpath);
                }
            }).catch(() => {});
        }
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

    const wssv1 = new WebSocketServer({ port: opts.wsPort, path: "/api/v1" });

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
    }, opts.wsPingInterval);

    wssv1.on("close", () => {
        clearInterval(interval);
    });

    const queue = getQueue();
    const api = getAPI(opts.ideComPort);
    const apiStatus = getStatus();

    console.log(`listening on ws: ${opts.wsPort}`);
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
            send("currentFile", undefined, file);
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
        const queueSender = () => {
            send("queue", undefined, queue.queue());
        };
        api.on("currentFile", currentFileSender);
        api.on("open", openSender);
        api.on("close", closeSender);
        api.on("error", errorSender);
        queue.on("changed", queueSender);

        ws.on("close", () => {
            api.off("currentFile", currentFileSender);
            api.off("open", openSender);
            api.off("close", closeSender);
            api.off("error", errorSender);
            queue.off("changed", queueSender);

            removePing(ws);
        });

        // send an initialize message
        send("initialize", undefined, { wsPingInterval: opts.wsPingInterval });

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
                            queue.setQueue(q);
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
                    send("queue", id, queue.queue());
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
                        readDataFile(opts.writeDir, `${d.data.sha1}.txt`, "utf8").then((data: Buffer|string) => {
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
                            writeDataFile(opts.writeDir, `${d.data.sha1}.txt`, d.data.name, "utf8").then(() => {
                                send("setName", id, { sha1: d.data.sha1, name: d.data.name });
                            }).catch(e => {
                                error("setName", id, e.message);
                            });
                        } else {
                            unlinkDataFile(opts.writeDir, `${d.data.sha1}.txt`).then(() => {
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
                        } else if (d.data.gif === true) {
                            fn += ".gif";
                        } else {
                            fn += ".png";
                        }
                        readDataFile(opts.writeDir, fn).then((data: Buffer|string) => {
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
                            encodePng(data).then((buf: Buffer) => {
                                return writeDataFile(opts.writeDir, `${d.data.sha1}.png`, buf);
                            }).then(() => {
                                return encodePng(data, 200);
                            }).then((buf: Buffer) => {
                                return writeDataFile(opts.writeDir, `${d.data.sha1}.thumb.png`, buf);
                            }).then(() => {
                                if (convpath)
                                    return encodeGif(convpath, data, 100);
                                return undefined;
                            }).then((buf: Buffer|undefined) => {
                                if (buf !== undefined)
                                    return writeDataFile(opts.writeDir, `${d.data.sha1}.gif`, buf);
                                return undefined;
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
}

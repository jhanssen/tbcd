import Options from "@jhanssen/options";
import WebSocket from "ws";
import xdg from "xdg-basedir";
import mkdirp from "mkdirp";
import fetch from "node-fetch";
import { API } from "./api";
import { convertToTga, decodeImage } from "./image";
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

const writeDir = options("write-dir", path.join(xdg.data || "/", "tbcd"));
if (typeof writeDir !== "string" || writeDir.indexOf("/tbcd") === 0) {
    console.log("invalid writeDir, no xdgData?", writeDir);
    process.exit(1);
}

async function writeDataFile(file: string, data: Buffer) {
    assert(typeof writeDir === "string", "writeDir must be string");
    await fs.writeFile(path.join(writeDir, file), data);
}

async function readDataFile(file: string) {
    assert(typeof writeDir === "string", "writeDir must be string");
    return await fs.readFile(path.join(writeDir, file));
}

(async function() {
    try {
        console.log("writeDir", writeDir);
        await mkdirp(writeDir);
    } catch (e) {
        console.error("error making writeDir", e);
        process.exit(1);
    }

    const api = new API(comPort);
    const wssv1 = new WebSocketServer({ port: wsPort, path: "/api/v1" });
    console.log(`listening on ws: ${wsPort}`);
    wssv1.on("connection", ws => {
        const send = (type: string, id: number | undefined, msg: any) => {
            try {
                ws.send(JSON.stringify({ type: type, id: id, data: msg }));
            } catch (e) {
                console.error("send error", type, e);
            }
        };

        const error = (type: string, id: number | undefined, err: string) => {
            send("error", id, { "errorType": type, "error": err });
        };

        api.on("currentFile", (file: string) => {
            send("currentFile", undefined, file);
        });

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
                case "currentFile":
                    api.getCurrentFile().then(file => {
                        send("currentFile", id, file);
                    }).catch(e => { throw e; });
                    break;
                case "setCurrentFile":
                    if (typeof d.file === "string") {
                        api.selectFile(d.file);
                    } else {
                        error("setCurrentFile", id, "need a file parameter");
                    }
                    break;
                case "bitmap":
                    if (typeof d.sha1 === "string") {
                        let fn = d.sha1;
                        let decoder = "sharp";
                        if (d.small === true) {
                            fn += ".tga";
                            decoder = "tga";
                        }
                        readDataFile(fn).then((data: Buffer) => {
                            return decodeImage(decoder, data);
                        }).then((data: Buffer) => {
                            send("bitmap", id, { sha1: d.sha1, small: d.small, data: data.toString("base64") });
                        }).catch(e => {
                            error("bitmap", id, e.message);
                        });
                    } else {
                        error("bitmap", id, "need a sha1 parameter");
                    }
                    break;
                case "setBitmap":
                    if (typeof d.sha1 === "string" && typeof d.data === "string") {
                        // first, base64 decode data
                        try {
                            const data = Buffer.from(d.data, "base64");
                            // const tga = new TGA(data);
                            convertToTga(data, 100).then((buf: Buffer) => {
                                return writeDataFile(`${d.sha1}.tga`, buf);
                            }).then(() => {
                                return writeDataFile(d.sha1, data);
                            }).then(() => {
                                send("setBitmap", id, { sha1: d.sha1 });
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
                    if (typeof d.data === "string") {
                        try {
                            const decrypted = decrypt(d.data);
                            send("decrypt", id, { data: decrypted });
                        } catch (e) {
                            error("decrypt", id, e.message);
                        }
                    } else {
                        error("decrypt", id, "need a data parameter");
                    }
                    break;
                case "fetch":
                    if (typeof d.url === "string") {
                        fetch(d.url).then(data => {
                            return data.arrayBuffer();
                        }).then(data => {
                            send("fetch", id, Buffer.from(data).toString(d.encoding || "base64"));
                        }).catch(e => {
                            error("fetch", id, e.message);
                        });
                    } else {
                        error("fetch", id, "need an url parameter");
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

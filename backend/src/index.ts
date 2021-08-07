import Options from "@jhanssen/options";
import WebSocket from "ws";
import xdg from "xdg-basedir";
import mkdirp from "mkdirp";
import { API } from "./api";
import { convertToTga } from "./image";
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
        const send = (type: string, msg: any) => {
            try {
                ws.send(JSON.stringify({ type: type, data: msg }));
            } catch (e) {
                console.error("send error", type, e);
            }
        };

        const error = (type: string, err: string) => {
            send("error", { "errorType": type, "error": err });
        };

        api.on("currentFile", (file: string) => {
            send("currentFile", file);
        });

        ws.on("message", msg => {
            // console.log("msg", msg.toString());
            try {
                const d = JSON.parse(msg.toString());
                switch (d.type) {
                case "images":
                    api.getImages().then(imgs => {
                        send("images", imgs);
                    }).catch(e => { throw e; });
                    break;
                case "currentFile":
                    api.getCurrentFile().then(file => {
                        send("currentFile", file);
                    }).catch(e => { throw e; });
                    break;
                case "setCurrentFile":
                    if (typeof d.file === "string") {
                        api.selectFile(d.file);
                    } else {
                        error("setCurrentFile", "need a file parameter");
                    }
                    break;
                case "image":
                    if (typeof d.sha1 === "string") {
                        readDataFile(d.sha1).then((data: Buffer) => {
                            send("image", { sha1: d.sha1, data: data.toString("base64") });
                        }).catch(e => {
                            error("image", e.message);
                        });
                    } else {
                        error("image", "need a sha1 parameter");
                    }
                    break;
                case "setImage":
                    if (typeof d.sha1 === "string" && typeof d.data === "string") {
                        // first, base64 decode data
                        try {
                            const data = Buffer.from(d.data, "base64");
                            // const tga = new TGA(data);
                            convertToTga(data, 100).then((buf: Buffer) => {
                                return writeDataFile(`${d.sha1}.tga`, buf);
                            }).then(() => {
                                send("setImage", { sha1: d.sha1 });
                            }).catch(e => {
                                throw e;
                            });
                        } catch (e) {
                            error("setImage", e.message);
                        }
                    } else {
                        error("setImage", "need a sha1 and data parameter");
                    }
                }
            } catch (e) {
                console.error("message error", e);
                error("message", e.message);
            }
        });
    });
})().then(() => {}).catch(e => { console.error(e); process.exit(1); });

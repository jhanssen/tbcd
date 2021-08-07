import Options from "@jhanssen/options";
import WebSocket from "ws";
import { API } from "./tbcd";

const options = Options({ prefix: "tbcd" });
const WebSocketServer = WebSocket.Server;

const comPort = options("com-port");
if (typeof comPort !== "string") {
    console.error("invalid port name", comPort);
    process.exit(1);
}
const wsPort = options.int("ws-port", 8089);

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
            }
        } catch (e) {
            console.error("message error", e);
            error("message", e.message);
        }
    });
});

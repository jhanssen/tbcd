import Options from "@jhanssen/options";
import xdg from "xdg-basedir";
import mkdirp from "mkdirp";
import path from "path";
import { initialize as queueInitialize } from "./queue";
import { wsInitialize, spInitialize, statusInitialize } from "./api";

const options = Options({ prefix: "tbcd" });

const ideComPort = options("ide-com-port");
if (typeof ideComPort !== "string") {
    console.error("invalid port name", ideComPort);
    process.exit(1);
}
const pcComPort = options("pc-com-port");
const pcComBps = options.int("pc-com-bps", 115200);
const wsPort = options.int("ws-port", 8089);
const wsPingInterval = options.int("ws-ping-interval", 60000);

const queueButtonPin = options.int("queue-button-pin", -1);
const longPressMs = options.int("queue-button-long-press", 1500);

const writeDir = options("write-dir", path.join(xdg.data || "/", "tbcd"));
if (typeof writeDir !== "string" || writeDir.indexOf("/tbcd") === 0) {
    console.log("invalid writeDir, no xdgData?", writeDir);
    process.exit(1);
}

(async function() {
    try {
        console.log("writeDir", writeDir);
        await mkdirp(writeDir);

        // the order of these is important
        await statusInitialize({ ideComPort });
        await queueInitialize({ ideComPort, queueButtonPin, longPressMs });
        await wsInitialize({ writeDir, ideComPort, wsPort, wsPingInterval });
        if (typeof pcComPort === "string") {
            console.log("bringing up pc api");
            await spInitialize({ writeDir, ideComPort, pcComPort, pcComBps });
        } else {
            console.log("not bringing up pc api");
        }
    } catch (e) {
        console.error("error bringing up backend", e);
        process.exit(1);
    }
})().then(() => {}).catch(e => { console.error(e); process.exit(1); });

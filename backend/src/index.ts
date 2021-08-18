import Options from "@jhanssen/options";
import xdg from "xdg-basedir";
import mkdirp from "mkdirp";
import path from "path";
import { initialize as queueInitialize } from "./queue";
import { wsInitialize } from "./api";

const options = Options({ prefix: "tbcd" });

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

(async function() {
    try {
        console.log("writeDir", writeDir);
        await mkdirp(writeDir);

        await queueInitialize({ comPort, queueButtonPin, longPressMs });
        await wsInitialize({ writeDir, comPort, wsPort, wsPingInterval });
    } catch (e) {
        console.error("error making writeDir", e);
        process.exit(1);
    }

})().then(() => {}).catch(e => { console.error(e); process.exit(1); });

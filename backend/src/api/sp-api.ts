import { getAPI, getStatus } from "./index";
import { API } from "./common";
import { APIStatus } from "./status";
import { readDataFile } from "../file";
import assert from "../assert";
import SerialPort from "serialport";

interface SPAPIOptions {
    writeDir: string;
    ideComPort: string;
    pcComPort: string;
}

let datas: Buffer[] = [];
let dataOffset = 0;

function zero(str: string) {
    const b = Buffer.alloc(str.length + 1, 0);
    b.write(str, 0, str.length);
    return b;
}

interface ProcessOptions {
    api: API;
    apiStatus: APIStatus,
    writeDir: string;
    port: SerialPort;
}

function processData(opts: ProcessOptions, data: Buffer) {
    const len = Buffer.byteLength(data);
    if (len < 3)
        return 0;
    switch (data.toString("ascii", 0, 2)) {
    case "it": {
        // items
        opts.api.getImages().then(imgs => {
            const reads = [];
            for (let i of imgs) {
                reads.push(readDataFile(opts.writeDir, `${i.sha1}.txt`, "utf8"));
            }
            Promise.allSettled(reads).then(names => {
                const rnames = names.map(n => {
                    switch (n.status) {
                    case "fulfilled":
                        return n.value as string;
                    default:
                        break;
                    }
                    return "";
                });
                if (rnames.length !== imgs.length) {
                    throw new Error(`name length mismatch ${rnames.length} {imgs.length}`);
                }
                for (let i = 0; i < imgs.length; ++i) {
                    // write sha1, name
                    opts.port.write("it");
                    opts.port.write(zero(imgs[i].sha1));
                    opts.port.write(zero(rnames[i]));
                }
            }).catch((e: Error) => { throw e; });
        }).catch((e: Error) => { console.error("api getImages error", e.message); });
        return 3; }
    case "ci":
        // current item
        if (data[2] === 0) {
            // get current item
            opts.api.getCurrentSha1().then(file => {
                opts.port.write(zero(`ci${file || ""}`));
            }).catch((e: Error) => { console.error("api getCurrentSha1 error", e.message); });
            return 3;
        } else {
            // set current item
            // scan for 0 terminate
            const z1 = data.indexOf(0, 2);
            if (z1 === -1)
                return 0;
            // grab the sha1
            const sha1 = data.toString("ascii", 2, z1);
            try {
                opts.api.selectFile(sha1, true);
            } catch (e) {
                console.error("api selectFile error", e.message);
            }
            return z1 + 1;
        }
    case "im":
        // scan for 0 terminate
        const z1 = data.indexOf(0, 2);
        if (z1 === -1)
            return 0;
        // grab the sha1
        const sha1 = data.toString("ascii", 2, z1);
        readDataFile(opts.writeDir, `${sha1}.gif`).then((data: Buffer|string) => {
            assert(typeof data !== "string", "data has to be buffer");
            const imglen = Buffer.alloc(4);
            imglen.write("im", 0, 2);
            imglen.writeUInt16LE(Buffer.byteLength(data), 2);
            opts.port.write(imglen);
            opts.port.write(data);
        }).catch((e: Error) => { console.error("api read image error", e.message); });
        return z1 + 1;
    }
    return 0;
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

    const processOpts: ProcessOptions = {
        api,
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
        datas.push(data);
        if (datas.length > 0) {
            if (datas.length > 1) {
                const b = Buffer.concat(datas);
                datas = [b];
            }
            dataOffset += processData(processOpts, datas[0]);
            if (dataOffset === Buffer.byteLength(datas[0])) {
                dataOffset = 0;
                datas = [];
            }
        }
    });
    api.on("currentSha1", (sha1: string|undefined) => {
        port.write(zero(`ci${sha1 || ""}`));
    });
}

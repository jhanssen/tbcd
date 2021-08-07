import Options from "@jhanssen/options";
import SerialPort from "serialport";

type Readline = SerialPort.parsers.Readline;

const options = Options({ prefix: "tbcd" });

const data: {
    port?: SerialPort;
    parser?: Readline;
} = {};

const portName = options("port");
if (typeof portName !== "string") {
    console.error("invalid port name", portName);
    process.exit(1);
}

function run() {
    return new Promise<void>((resolve, reject) => {
        data.port = new SerialPort(portName as string, {
            baudRate: 9600
        });
        data.port.on("error", e => {
            reject(e);
        });
        data.parser = data.port.pipe(new SerialPort.parsers.Readline({ delimiter: "\r\n" }));
        data.parser.on("data", (data: string) => {
            console.log("got data", data);
            resolve();
        });
        data.port.write("status\r\n");
    });
}

(async function() {
    await run();
})().then(() => {
    process.exit();
}).catch(e => {
    console.error(e.message);
    process.exit(1);
});

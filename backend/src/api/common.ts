import SerialPort from "serialport";
import EventEmitter from "events";
import crypto from "crypto";
import assert from "../assert";

export interface Image {
    name: string;
    sha1: string;
}

type ImageResolve = (value: Image[] | PromiseLike<Image[]>) => void
type CurrentFileResolve = (value: string | PromiseLike<string>) => void
type Reject = (reason?: any) => void;

type CommandCheck = (data: string) => boolean;
type Timeout = ReturnType<typeof setTimeout>;

interface Command {
    cmd: string;
    check?: CommandCheck;
}

interface ImageRequest {
    resolve: ImageResolve;
    reject: Reject
}

interface CurrentFileRequest {
    resolve: CurrentFileResolve;
    reject: Reject;
}

const initialBackoff = 500;
const maxBackoff = 30000;

export class API extends EventEmitter {
    private portName: string;
    private port?: SerialPort;
    private data?: string;
    private images?: Image[];
    private imageReqs: ImageRequest[];
    private currentFileReqs: CurrentFileRequest[];
    private currentSha1Reqs: CurrentFileRequest[];
    private cmds: Command[];
    private currentCmd?: string;
    private currentDir: string;
    private currentFile?: string;
    private currentDrive: number;
    private pendingDirs: string[];
    private pendingFiles: string[];
    private pendingImages: Image[];
    private drives: string[];
    private ready: boolean;
    private reconnectTimer?: Timeout;
    private backoff: number = initialBackoff;

    constructor(portName: string) {
        super();

        this.portName = portName;
        this.drives = ["SD:", "USB0:", "USB1:"];
        this.imageReqs = [];
        this.currentFileReqs = [];
        this.currentSha1Reqs = [];
        this.cmds = [];
        this.currentDir = "/";
        this.pendingDirs = [];
        this.pendingFiles = [];
        this.pendingImages = [];
        this.currentDrive = 0;
        this.ready = true;
        this.reconnect();
    }

    public getImages(): Promise<Image[]> {
        return new Promise<Image[]>((resolve, reject) => {
            if (this.images) {
                resolve(this.images);
            } else {
                this.imageReqs.push({ resolve: resolve, reject: reject });
            }
        });
    }

    public getCurrentFile(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (this.currentFile !== undefined) {
                resolve(this.currentFile);
            } else {
                this.currentFileReqs.push({ resolve: resolve, reject: reject });
            }
        });
    }

    public getCurrentSha1(): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            let done = false;
            if (this.currentFile !== undefined) {
                if (this.images) {
                    for (let i of this.images) {
                        if (i.name === this.currentFile) {
                            resolve(i.sha1);
                            done = true;
                            break;
                        }
                    }
                }
                if (!done) {
                    this.currentSha1Reqs.push({ resolve: resolve, reject: reject });
                }
            }
        });
    }

    public selectFile(file: string, sha1?: boolean) {
        let name = file;
        if (sha1 === true) {
            if (this.images) {
                let found = false;
                for (const i of this.images) {
                    if (i.sha1 === file) {
                        name = i.name;
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    throw new Error(`sha1 ${file} not found`);
                }
            } else {
                throw new Error(`No images`);
            }
        }
        this.write(`disk select ${name}`);
        this.write("status", (data: string) => {
            if (data.indexOf("Unable to open") !== -1) {
                this.finalizeCurrentFile();
                return false;
            }
            return true;
        });
    }

    public removeFile() {
        this.write("disk remove");
        this.write("status");
    }

    private tryReconnect() {
        if (this.reconnectTimer)
            return;
        this.clear();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.reconnect();
        }, this.backoff);
        this.backoff = Math.min(this.backoff * 2, maxBackoff);
    }

    private clear() {
        this.imageReqs = [];
        this.currentFileReqs = [];
        this.currentSha1Reqs = [];
        this.cmds = [];
        this.currentDir = "/";
        this.pendingDirs = [];
        this.pendingFiles = [];
        this.pendingImages = [];
        this.currentDrive = 0;
        this.ready = true;
        this.data = undefined;
        this.images = undefined;
        this.currentCmd = undefined;
        this.currentFile = undefined;
    }

    private reconnect() {
        this.port = new SerialPort(this.portName, {
            baudRate: 9600
        }, (err?: Error | null) => {
            process.nextTick(() => {
                if (err !== undefined && err !== null) {
                    console.error("open error", err.message);
                    this.emit("error", err);
                    this.tryReconnect();
                } else {
                    console.error("api open");
                    this.emit("open");
                    this.backoff = initialBackoff;
                }
            });
        });
        this.port.on("error", e => {
            console.error("api error", e.message);
            this.emit("error", e);
            assert(this.port !== undefined, "port can't be undefined");
            this.port.close();
            this.tryReconnect();
        });
        this.port.on("close", () => {
            console.error("api close");
            this.emit("close");
            this.tryReconnect();
        });
        this.port.on("data", (data: Buffer) => {
            if (this.data === undefined) {
                this.data = data.toString();
            } else {
                this.data += data.toString();
            }
            this.process();
        });
        this.write("status");
        this.write(this.drives[0]);
        this.write("cd /", (data: string) => { return this.checkDrive(data); });
    }

    private checkDrive(data: string) {
        if (data.indexOf("Invalid drive") !== -1) {
            // try the next drive
            if (this.currentDrive === this.drives.length - 1) {
                // actually done
                this.finalizeImages();
                return false;
            }
            ++this.currentDrive;
            this.write(this.drives[this.currentDrive]);
            this.write("cd /", (data: string) => { return this.checkDrive(data); });
            return false;
        }
        this.write("dir");
        return true;
    }

    private write(cmd: string, check?: CommandCheck) {
        assert(this.port !== undefined, "port can't be undefined");
        console.log(this.ready, cmd);
        if (this.ready) {
            this.currentCmd = cmd;
            this.port.write(`${cmd}\r\n`);
            this.ready = false;
        } else {
            this.cmds.push({ cmd: cmd, check: check });
        }
    }

    private process() {
        if (this.data === undefined)
            return;
        assert(this.port, "port has to be defined");
        const data = this.data.split("\r\n").filter(e => e.trim().length > 0);
        // see if we have a prompt waiting
        const prx = /^(SD|USB[0-9]):\/[^>]*> /;
        const last = data[data.length - 1];
        const haspr = prx.exec(last);
        if (haspr === null)
            return;
        console.log("got for", this.currentCmd, data);
        if (this.currentCmd !== undefined) {
            switch (true) {
            case /^status$/.test(this.currentCmd):
                // find the current image
                let gotIso = false;
                for (const l of data) {
                    if (l.indexOf("ISO file: ") === 0) {
                        this.currentFile = l.substr(10);
                        this.finalizeCurrentFile();
                        gotIso = true;
                    }
                }
                if (!gotIso) {
                    // no current file
                    this.currentFile = "";
                    this.finalizeCurrentFile();
                }
                break;
            case /^dir$/.test(this.currentCmd):
                if (this.processDiscs(data) && this.processDrive()) {
                    this.finalizeImages();
                }
                break;
            case /^disk describe .*/.test(this.currentCmd):
                if (this.processFile(data) && this.processDrive()) {
                    this.finalizeImages();
                }
                break;
            default:
                break;
            }
        }
        let didcmd = false;
        while (this.cmds.length > 0) {
            const cmd = this.cmds.shift();
            assert(cmd !== undefined, "cmd can't be undefined");
            if (!cmd.check || cmd.check(this.data)) {
                this.currentCmd = cmd.cmd;
                this.port.write(`${cmd.cmd}\r\n`);
                didcmd = true;
                break;
            }
        }
        this.data = undefined;
        if (!didcmd) {
            this.currentCmd = undefined;
            this.ready = true;
        }
    }

    private finalizeImages() {
        this.images = this.pendingImages;
        this.pendingImages = [];

        for (const req of this.imageReqs) {
            req.resolve(this.images);
        }
        this.imageReqs = [];
    }

    private finalizeCurrentFile() {
        assert(this.currentFile !== undefined, "currentFile can't be undefined");
        for (const req of this.currentFileReqs) {
            req.resolve(this.currentFile);
        }
        this.currentFileReqs = [];
        this.emit("currentFile", this.currentFile);
        // find the sha of this
        if (this.images) {
            for (let i of this.images) {
                if (i.name === this.currentFile) {
                    for (const req of this.currentSha1Reqs) {
                        req.resolve(i.sha1);
                    }
                    this.currentSha1Reqs = [];
                    this.emit("currentSha1", i.sha1);
                    break;
                }
            }
        }
    }

    private processDrive() {
        if (this.currentDrive === this.drives.length - 1)
            return true;
        this.write(this.drives[++this.currentDrive]);
        this.write("cd /", (data: string) => { return this.checkDrive(data); });
        return false;
    }

    private processDiscs(data: string[]) {
        // console.log("got discs data");
        const drx = /\s*([0-9]+|<DIR>) \| (.*)\s*/;
        const dirs: string[] = [];
        const files: string[] = [];
        for (const l of data) {
            const pd = drx.exec(l);
            if (pd === null)
                continue;
            if (pd[2][0] === ".")
                continue;
            if (pd[1] === "<DIR>") {
                dirs.push(this.currentDir + pd[2]);
            } else {
                files.push(this.drives[this.currentDrive] + this.currentDir + pd[2]);
            }
        }
        // console.log("processed discs", dirs, files);
        this.pendingDirs = this.pendingDirs.concat(dirs);
        this.pendingFiles = this.pendingFiles.concat(files);

        if (this.pendingDirs.length > 0) {
            const dir = this.pendingDirs.shift();
            assert(typeof dir === "string", "dir must be string");
            const oldDir = this.currentDir;
            this.currentDir = dir + "/";
            this.write(`cd ${dir}`);
            this.write("dir", (data: string) => {
                const ok = data.indexOf("Error changing") === -1;
                if (!ok)
                    this.currentDir = oldDir;
                return ok;
            });
            return false;
        } else if (this.pendingFiles.length > 0) {
            const file = this.pendingFiles.shift();
            assert(typeof file === "string", "dir must be string");
            this.write(`disk describe ${file}`);
            return false;
        }

        return true;
    }

    private processFile(data: string[]) {
        if (data.length > 1 && data[1].indexOf("Unable to open") == -1) {
            // console.log("processed file", this.currentCmd, data.slice(1, data.length - 1));
            assert(this.currentCmd !== undefined, "currentCmd must not be undefined");
            const fn = this.currentCmd.substr(14);
            const lines = data.slice(1, data.length - 1);
            const sha1 = crypto.createHash("sha1");
            sha1.update(fn);
            for (const line of lines) {
                sha1.update(line);
            }
            this.pendingImages.push({ name: fn, sha1: sha1.digest("hex") });
        }
        if (this.pendingFiles.length > 0) {
            const file = this.pendingFiles.shift();
            assert(typeof file === "string", "dir must be string");
            this.write(`disk describe ${file}`);
            return false;
        }
        return true;
    }
}


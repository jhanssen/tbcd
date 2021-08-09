import { Injectable } from '@angular/core';
import { Subject, ReplaySubject } from 'rxjs';
import { encode } from './base64';

export interface Image {
    name: string;
    sha1: string;
}

type Timeout = ReturnType<typeof setTimeout>;
type PromiseResolve<Type> = (value: Type | PromiseLike<Type>) => void;
type VoidResolve = PromiseResolve<void>;
type StringResolve = PromiseResolve<string>;
type ImageResolve = PromiseResolve<Image[]>;
type Reject = (reason?: any) => void;

interface Request<ResolveType> {
    id: number;
    resolve: ResolveType;
    reject: Reject
}

type ImageRequest = Request<ImageResolve>;
type CurrentFileRequest = Request<StringResolve>;
type BitmapRequest = Request<StringResolve>;
type SetBitmapRequest = Request<VoidResolve>;
type DecryptRequest = Request<StringResolve>;
type FetchRequest = Request<StringResolve>;
type NameRequest = Request<StringResolve>;

const initialBackoff = 500;
const maxBackoff = 30000;
const defaultPort = 8089;

function dispatch<Type>(id: number, data: Type, reqs: Request<PromiseResolve<Type>>[]) {
    for (let idx = 0; idx < reqs.length; ++idx) {
        if (reqs[idx].id === id) {
            // goodie
            reqs[idx].resolve(data);
            reqs.splice(idx, 1);
            return;
        }
    }
    console.error("dispatch, id not found", id);
}

function discard<Type>(id: number, data: string | Error, reqs: Request<PromiseResolve<Type>>[]) {
    for (let idx = 0; idx < reqs.length; ++idx) {
        if (reqs[idx].id === id) {
            // goodie
            reqs[idx].reject(data instanceof Error ? data : new Error(data));
            reqs.splice(idx, 1);
            return;
        }
    }
    console.error("discard, id not found", id);
}

function discardAll<Type>(reqs: Request<PromiseResolve<Type>>[], data: Error) {
    for (const req of reqs) {
        req.reject(data);
    }
    reqs.splice(0, reqs.length);
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
    private currentFileSubject = new Subject<string>();
    private ideOpenSubject = new ReplaySubject<boolean>(1);
    private wsOpenSubject = new ReplaySubject<boolean>(1);
    private wsPortNumber: number;

    private socket: WebSocket;
    private id: number = 0;
    private imageReqs: ImageRequest[] = [];
    private currentFileReqs: CurrentFileRequest[] = [];
    private bitmapReqs: BitmapRequest[] = [];
    private setBitmapReqs: SetBitmapRequest[] = [];
    private decryptReqs: DecryptRequest[] = [];
    private fetchReqs: FetchRequest[] = [];
    private nameReqs: NameRequest[] = [];
    private pendingSends?: string[];
    private base: string;
    private reconnectTimer?: Timeout;
    private backoff: number = initialBackoff;
    private serverPingInterval: number = 0;
    private lastPing: number = 0;

    constructor() {
        const p = window.localStorage.getItem("wsport") || (defaultPort + "");
        this.wsPortNumber = parseInt(p, 10);
        if (this.wsPortNumber <= 0 || this.wsPortNumber > 65535)
            this.wsPortNumber = defaultPort;
        this.updateBase();
        this.connect();

        setInterval(() => { this.checkPing(); }, 15000);
    }

    public get onCurrentFile() {
        this.send("currentFile", undefined);
        return this.currentFileSubject;
    }

    public get onIdeOpen() {
        return this.ideOpenSubject;
    }

    public get onWsOpen() {
        return this.wsOpenSubject;
    }

    public get port() {
        return this.wsPortNumber;
    }

    public set port(p: number) {
        if (p === this.wsPortNumber)
            return;
        if (p <= 0 || p > 65535)
            throw new Error(`Invalid ws port ${p}`);
        this.wsPortNumber = p;
        this.updateBase();
        this.socket.close();
        this.connect();
    }

    public currentFile(): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.currentFileReqs.push({ id, resolve, reject });
            this.send("currentFile", id);
        });
    }

    public setCurrentFile(file: string) {
        this.send("setCurrentFile", undefined, { file: file });
    }

    public images(): Promise<Image[]> {
        const id = this.nextId();
        return new Promise<Image[]>((resolve, reject) => {
            this.imageReqs.push({ id, resolve, reject });
            this.send("images", id);
        });
    }

    public bitmap(sha1: string, thumbnail?: boolean): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.bitmapReqs.push({ id, resolve, reject });
            this.send("bitmap", id, { sha1: sha1, thumbnail: thumbnail });
        });
    }

    public setBitmap(sha1: string, bitmap: ArrayBuffer | Uint8Array | string): Promise<void> {
        const id = this.nextId();
        return new Promise<void>((resolve, reject) => {
            this.setBitmapReqs.push({ id, resolve, reject });
            const encoded: string = (typeof bitmap === "string") ? bitmap : encode(bitmap);
            this.send("setBitmap", id, { sha1: sha1, data: encoded });
        });
    }

    public decrypt(data: string): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.decryptReqs.push({ id, resolve, reject });
            this.send("decrypt", id, { data: data });
        });
    }

    public fetch(url: string, encoding?: string): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.fetchReqs.push({ id, resolve, reject });
            this.send("fetch", id, { url: url, encoding: encoding });
        });
    }

    public name(sha1: string): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.nameReqs.push({ id, resolve, reject });
            this.send("name", id, { sha1: sha1 });
        });
    }

    public setName(sha1: string, name: string | undefined) {
        this.send("setName", undefined, { sha1: sha1, name: name });
    }

    private updateBase() {
        const loc = window.location;
        this.base = `ws://${loc.hostname}:${this.wsPortNumber}`;
    }

    private connect() {
        console.log(`trying to connect to ${this.base}/api/v1`);

        this.serverPingInterval = 0;
        this.id = 0;
        this.socket = new WebSocket(`${this.base}/api/v1`);
        this.socket.onmessage = event => {
            if (typeof event.data !== "string") {
                // would be bad
                console.error("invalid event data", typeof event.data);
                return;
            }
            // parse this
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                case "open":
                    this.ideOpenSubject.next(true);
                    break;
                case "error":
                    // fall through
                case "close":
                    this.ideOpenSubject.next(false);
                    break;
                case "currentFile":
                    if (typeof data.data === "string") {
                        if (typeof data.id === "number") {
                            dispatch<string>(data.id, data.data, this.currentFileReqs);
                        } else {
                            this.currentFileSubject.next(data.data);
                        }
                    } else {
                        console.error("no data for currentFile");
                    }
                    break;
                case "images":
                    if (typeof data.data === "object") {
                        if (typeof data.id === "number") {
                            dispatch<Image[]>(data.id, data.data, this.imageReqs);
                        } else {
                            console.error("no id for image response");
                        }
                    } else {
                        console.error("no data for images");
                    }
                    break;
                case "bitmap":
                    if (typeof data.data === "object" && typeof data.data.data === "string") {
                        if (typeof data.id === "number") {
                            dispatch<string>(data.id, "data:image/png;base64," + data.data.data, this.bitmapReqs);
                        } else {
                            console.error("no id for bitmap response");
                        }
                    } else {
                        console.error("no data for bitmap");
                    }
                    break;
                case "setBitmap":
                    if (typeof data.id === "number") {
                        dispatch<void>(data.id, undefined, this.setBitmapReqs);
                    } else {
                        console.error("no id for setBitmap response");
                    }
                    break;
                case "decrypt":
                    if (typeof data.data === "object" && typeof data.data.data === "string") {
                        if (typeof data.id === "number") {
                            dispatch<string>(data.id, data.data.data, this.decryptReqs);
                        } else {
                            console.error("no id for decrypt response");
                        }
                    } else {
                        console.error("no data for decrypt");
                    }
                    break;
                case "fetch":
                    if (typeof data.data === "string") {
                        if (typeof data.id === "number") {
                            dispatch<string>(data.id, data.data, this.fetchReqs);
                        } else {
                            console.error("no id for fetch response");
                        }
                    } else {
                        console.error("no data for fetch");
                    }
                    break;
                case "name":
                    if (typeof data.data === "string") {
                        if (typeof data.id === "number") {
                            dispatch<string>(data.id, data.data, this.nameReqs);
                        } else {
                            console.error("no id for name response");
                        }
                    } else {
                        console.error("no data for name");
                    }
                    break;
                case "ping":
                    this.send("pong", undefined);
                    this.lastPing = Date.now();
                    break;
                case "initialize":
                    if (typeof data.data === "object" && typeof data.data.wsPingInterval === "number") {
                        this.serverPingInterval = data.data.wsPingInterval;
                    }
                    break;
                case "error":
                    let handled = false;
                    if (typeof data.id === "number") {
                        if (typeof data.data === "object" && typeof data.data.errorType === "string") {
                            switch (data.data.errorType) {
                            case "currentFile":
                                handled = true;
                                discard<string>(data.id, data.data.error, this.currentFileReqs);
                                break;
                            case "images":
                                handled = true;
                                discard<Image[]>(data.id, data.data.error, this.imageReqs);
                                break;
                            case "bitmap":
                                handled = true;
                                discard<string>(data.id, data.data.error, this.bitmapReqs);
                                break;
                            case "setBitmap":
                                handled = true;
                                discard<void>(data.id, data.data.error, this.setBitmapReqs);
                                break;
                            case "decrypt":
                                handled = true;
                                discard<string>(data.id, data.data.error, this.decryptReqs);
                                break;
                            case "fetch":
                                handled = true;
                                discard<string>(data.id, data.data.error, this.fetchReqs);
                                break;
                            case "name":
                                handled = true;
                                discard<string>(data.id, data.data.error, this.nameReqs);
                                break;
                            }
                        }
                    }
                    if (!handled) {
                        try {
                            console.error(`got unhandled error: ${data.data.errorType}, ${data.data.error}`);
                        } catch (e) {
                            console.error(`got error while trying to log unhandled error: ${e.message}`);
                        }
                    }
                    break;
                default:
                    console.error(`unhandled type ${data.type}`, data);
                    break;
                }
            } catch (e) {
                console.error("unable to parse event data", event.data);
            }
        };
        this.socket.onerror = () => {
            this.clear();
            this.reconnect();
            this.wsOpenSubject.next(false);
        };
        this.socket.onclose = () => {
            this.clear();
            this.reconnect();
            this.wsOpenSubject.next(false);
        };
        this.socket.onopen = () => {
            this.lastPing = Date.now();
            if (this.pendingSends) {
                for (const s of this.pendingSends) {
                    this.socket.send(s);
                }
                this.pendingSends = undefined;
            }
            this.backoff = initialBackoff;
            this.wsOpenSubject.next(true);
        };
    }

    private checkPing() {
        if (this.socket.readyState === 1) { // OPEN
            if (this.serverPingInterval > 0 && this.lastPing > 0) {
                if (Date.now() - this.lastPing > (this.serverPingInterval * 1.5)) {
                    console.error("ping timeout", Date.now(), this.lastPing, this.serverPingInterval);
                    // assume host dead
                    this.socket.close();
                    this.ideOpenSubject.next(false);
                    this.wsOpenSubject.next(false);
                    this.clear();
                    this.reconnect();
                }
            } else {
                console.error("invalid pings for open ws socket", this.serverPingInterval, this.lastPing);
            }
        }
    }

    private clear() {
        const e = new Error("socket closed");
        discardAll<Image[]>(this.imageReqs, e);
        discardAll<string>(this.currentFileReqs, e);
        discardAll<string>(this.bitmapReqs, e);
        discardAll<string>(this.decryptReqs, e);
        discardAll<string>(this.fetchReqs, e);
        discardAll<string>(this.nameReqs, e);
        discardAll<void>(this.setBitmapReqs, e);

        // unset handlers to be safe
        this.socket.onopen = undefined;
        this.socket.onclose = undefined;
        this.socket.onerror = undefined;
        this.socket.onmessage = undefined;

        this.serverPingInterval = this.lastPing = 0;
    }

    private reconnect() {
        if (this.reconnectTimer)
            return;
        // try to reconnect
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, this.backoff);
        this.backoff = Math.min(this.backoff * 2, maxBackoff);
    }

    private nextId() {
        return this.id++;
    }

    private send(type: string, id: number | undefined, data?: any) {
        try {
            const s = JSON.stringify({ type, id, data });
            if (this.socket.readyState === 1) { // OPEN
                this.socket.send(s);
            } else {
                if (this.pendingSends) {
                    this.pendingSends.push(s);
                } else {
                    this.pendingSends = [s];
                }
            }
        } catch (e) {
            console.error("unable to send", type);
        }
    }
}

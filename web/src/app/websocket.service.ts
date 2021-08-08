import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { encode } from './base64';

export interface Image {
    name: string;
    sha1: string;
}

type PromiseResolve<Type> = (value: Type | PromiseLike<Type>) => void;
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
type DecryptRequest = Request<StringResolve>;
type FetchRequest = Request<StringResolve>;
type NameRequest = Request<StringResolve>;

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

    private socket: WebSocket;
    private id: number = 0;
    private imageReqs: ImageRequest[] = [];
    private currentFileReqs: CurrentFileRequest[] = [];
    private bitmapReqs: BitmapRequest[] = [];
    private decryptReqs: DecryptRequest[] = [];
    private fetchReqs: FetchRequest[] = [];
    private nameReqs: NameRequest[] = [];
    private pendingSends?: string[];
    private base: string;

    constructor() {
        const loc = window.location;
        const wsport = 8089; // for now
        this.base = `ws://${loc.hostname}:${wsport}`;

        this.connect();
    }

    public get onCurrentFile() {
        this.send("currentFile", undefined);
        return this.currentFileSubject;
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

    public bitmap(sha1: string, small?: boolean): Promise<string> {
        const id = this.nextId();
        return new Promise<string>((resolve, reject) => {
            this.currentFileReqs.push({ id, resolve, reject });
            this.send("bitmap", id, { sha1: sha1, small: small });
        });
    }

    public setBitmap(sha1: string, bitmap: ArrayBuffer | Uint8Array) {
        const encoded = encode(bitmap);
        this.send("setBitmap", undefined, { sha1: sha1, data: encoded });
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

    private connect() {
        console.log(`trying to connect to ${this.base}/api/v1`);

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
                    console.error(`unhandled type ${data.type}`);
                    break;
                }
            } catch (e) {
                console.error("unable to parse event data", event.data);
            }
        };
        this.socket.onclose = () => {
            const e = new Error("socket closed");
            discardAll<Image[]>(this.imageReqs, e);
            discardAll<string>(this.currentFileReqs, e);
            discardAll<string>(this.bitmapReqs, e);
            discardAll<string>(this.decryptReqs, e);
            discardAll<string>(this.fetchReqs, e);
            discardAll<string>(this.nameReqs, e);

            // try to reconnect
            setTimeout(() => { this.connect(); }, 1000);
        };
        this.socket.onopen = () => {
            if (this.pendingSends) {
                for (const s of this.pendingSends) {
                    this.socket.send(s);
                }
                this.pendingSends = undefined;
            }
        };
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

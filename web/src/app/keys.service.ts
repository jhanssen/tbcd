import { Injectable } from '@angular/core';
import { WebsocketService } from './websocket.service';

interface GoogleKey {
    cx: string;
    key: string;
}

interface TheGamesDBKey {
    key: string;
}

export interface Keys {
    google?: GoogleKey;
    thegamesdb?: TheGamesDBKey;
}

type KeysResolve = (value: Keys | PromiseLike<Keys>) => void;
type Reject = (reason?: any) => void;

interface KeysRequest {
    resolve: KeysResolve;
    reject: Reject;
}

const encrypted = "65942d9f64332d52cca6b4c2c2d802fcb36d326f355753a7fc4880178a51641427d493dd648f36d09d9a7f1db66f91e9d8d0a9f05f4050b39029b4da8ebeca2a4e406a57461e3743fd0cf766ed0dd96436fd3e7a73e59883f5c96d16525fab32af69bce60b7979f283f633d3285815a44da3087611e45cc597a78fa13e478241fbe8dacf786bd8b02cd3fef805ebbdf13e7d6abb";

@Injectable({
  providedIn: 'root'
})
export class KeysService {
    private keysReqs: KeysRequest[] = [];
    private keyData?: Keys;
    private error?: Error;

    constructor(private ws: WebsocketService) {
        ws.decrypt(encrypted).then(dec => {
            const data = JSON.parse(dec);
            this.keyData = data as Keys;

            for (let r of this.keysReqs) {
                r.resolve(this.keyData);
            }
            this.keysReqs = [];
        }).catch(e => {
            this.error = e;
            for (let r of this.keysReqs) {
                r.reject(e);
            }
            this.keysReqs = [];
        });
    }

    public keys() {
        return new Promise<Keys>((resolve, reject) => {
            if (this.keyData) {
                resolve(this.keyData);
            } else if (this.error) {
                reject(this.error);
            } else {
                this.keysReqs.push({ resolve, reject });
            }
        });
    }
}

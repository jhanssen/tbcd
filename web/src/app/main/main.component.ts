import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebsocketService, Image } from '../websocket.service';
import { placeholder } from './placeholder';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit, OnDestroy {
    public images: Image[] = [];
    public current?: string;
    private imageDatas: { [key: string]: string } = {};
    private subs: any[] = [];

    constructor(private ws: WebsocketService) { }

    ngOnInit(): void {
        this.ws.images().then(imgs => {
            this.images = imgs;
            this.loadImageDatas();
        });
        let sub = this.ws.onCurrentFile.subscribe(file => {
            this.current = file;
        });
        this.subs.push(sub);
    }

    ngOnDestroy(): void {
        for (let d of this.subs) {
            d.unsubscribe();
        }
        this.subs = [];
        this.images = [];
        this.current = undefined;
        this.imageDatas = {};
    }

    public name(file: string) {
        let n = file;
        const slash = n.lastIndexOf("/");
        if (slash >= 0)
            n = n.substr(slash + 1);
        const dot = n.lastIndexOf(".");
        if (dot === -1)
            return n;
        return n.substr(0, dot);
    }

    public imageData(sha1: string) {
        if (sha1 in this.imageDatas) {
            return this.imageDatas[sha1];
        }
        return placeholder;
    }

    private loadImageDatas() {
        for (const img of this.images) {
            this.ws.bitmap(img.sha1).then(data => {
                this.imageDatas[img.sha1] = data;
            });
        }
    }
}

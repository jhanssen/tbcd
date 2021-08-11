import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
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
    public isIdeOpen: boolean = false;
    public isWsOpen: boolean = false;
    public queueMode: string[] = [];
    public queue: string[] = [];
    private imageBitmaps: { [key: string]: string } = {};
    private imageNames: { [key: string]: string } = {};
    private subs: any[] = [];

    constructor(private ws: WebsocketService, private router: Router) { }

    ngOnInit(): void {
        this.images = [];
        this.queueMode = [];
        this.ws.images().then(imgs => {
            this.images = imgs.sort((a, b) => {
                return a.name.localeCompare(b.name);
            });
            this.loadImageDatas();
            this.fixQueue();
        });
        let sub = this.ws.onCurrentFile.subscribe(file => {
            console.log("current is now", file);
            this.current = file;
        });
        this.subs.push(sub);
        sub = this.ws.onIdeOpen.subscribe(isopen => {
            this.isIdeOpen = isopen;
        });
        this.subs.push(sub);
        sub = this.ws.onWsOpen.subscribe(isopen => {
            this.isWsOpen = isopen;

            // grab the current queue
            this.ws.queue().then(q => {
                this.queue = q;
                if (this.images.length > 0)
                    this.fixQueue();
            });
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
        this.imageBitmaps = {};
    }

    private find(sha1: string): Image | undefined {
        for (const img of this.images) {
            if (img.sha1 === sha1)
                return img;
        }
        return undefined;
    }

    public config() {
        this.router.navigate(['/config']);
    }

    public enter(sha1: string) {
        const image = this.find(sha1);
        if (image === undefined)
            return;
        this.router.navigate(['/image', image.name, this.name(sha1), sha1]);
    }

    public select(sha1: string) {
        const image = this.find(sha1);
        if (image === undefined)
            return;
        this.ws.setCurrentFile(image.name);
    }

    public isSelected(sha1: string) {
        const image = this.find(sha1);
        if (image === undefined)
            return false;
        return image.name === this.current;
    }

    public name(sha1: string) {
        if (sha1 in this.imageNames) {
            return this.imageNames[sha1];
        }
        const image = this.find(sha1);
        let n = image.name;
        const slash = n.lastIndexOf("/");
        if (slash >= 0)
            n = n.substr(slash + 1);
        const dot = n.lastIndexOf(".");
        if (dot === -1)
            return n;
        return n.substr(0, dot);
    }

    public imageData(sha1: string) {
        if (sha1 in this.imageBitmaps) {
            return this.imageBitmaps[sha1];
        }
        return placeholder;
    }

    public queuePrev() {
        this.ws.queuePrev();
    }

    public queueNext() {
        this.ws.queueNext();
    }

    public toggleQueue(event: { value: string[]|null }) {
        console.log("togg", event);
        if (event.value.length === 0) {
            console.log("event", event);
            this.queueMode = [];
            this.queue = [];
            this.updateQueue();
        }
    }

    public inQueue(sha1: string) {
        return this.queue.indexOf(sha1) !== -1;
    }

    public enqueue(sha1: string) {
        const idx = this.queue.indexOf(sha1);
        if (idx >= 0) {
            this.queue.splice(idx, 1);
            if (idx === 0 && this.queue.length > 0) {
                this.select(this.queue[0]);
            } else {
                this.ws.setCurrentFile(undefined);
            }
        } else {
            this.queue.push(sha1);
            if (this.queue.length === 1) {
                this.select(sha1);
            }
        }
        this.updateQueue();
    }

    public queueName(sha1: string) {
        const idx = this.queue.indexOf(sha1);
        if (idx >= 0) {
            return `#${idx + 1}`;
        }
        return "Select";
    }

    private updateQueue() {
        const q = this.queue.map(sha1 => {
            const image = this.find(sha1);
            if (image === undefined)
                return undefined;
            return image.name;
        });
        this.ws.setQueue(q);
    }

    private fixQueue() {
        this.queue = this.queue.map(n => {
            for (const img of this.images) {
                if (img.name === n)
                    return img.sha1;
            }
            return undefined;
        }).filter(e => e !== undefined);
        this.queueMode = this.queue.length > 0 ? ["queue"] : [];
    }

    private loadImageDatas() {
        for (const img of this.images) {
            this.ws.bitmap(img.sha1, true).then(data => {
                this.imageBitmaps[img.sha1] = data;
            });
            this.ws.name(img.sha1).then(data => {
                this.imageNames[img.sha1] = data;
            });
        }
    }
}

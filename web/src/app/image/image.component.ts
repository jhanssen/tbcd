import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WebsocketService } from '../websocket.service';
import { placeholder } from '../main/placeholder';

@Component({
    selector: 'app-image',
    templateUrl: './image.component.html',
    styleUrls: ['./image.component.css']
})
export class ImageComponent implements OnInit, OnDestroy {
    public file?: string;
    public name?: string;
    public sha1?: string;
    public imageData: string;
    private subs: any[] = [];

    constructor(private route: ActivatedRoute, private router: Router,
                private ws: WebsocketService) { }

    ngOnInit(): void {
        let sub = this.route.params.subscribe(params => {
            this.file = params['file'];
            this.name = params['name'];
            this.sha1 = params['sha1'];

            if (this.sha1 !== undefined) {
                this.ws.bitmap(this.sha1).then(data => {
                    this.imageData = data;
                }).catch(e => {
                    console.error("bitmap error", e);
                });
            }
        });
        this.subs.push(sub);

        if (this.imageData === undefined)
            this.imageData = placeholder;
    }

    ngOnDestroy() {
        for (let d of this.subs) {
            d.unsubscribe();
        }
        this.subs = [];
    }

    public scrape() {
        this.router.navigate(["/scrape", this.name, this.sha1]);
    }

    public back() {
        this.router.navigate(["/"]);
    }

    public save() {
        if (this.sha1 !== undefined)
            this.ws.setName(this.sha1, this.name);
    }

    public select() {
        if (this.file !== undefined) {
            console.log("activating", this.file);
            this.ws.setCurrentFile(this.file);
        } else {
            console.error("no file");
        }
    }
}

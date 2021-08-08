import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { WebsocketService } from '../websocket.service';
import { KeysService } from '../keys.service';
import { getScraperService, ScraperService } from '../scraper.service';

@Component({
    selector: 'app-image',
    templateUrl: './image.component.html',
    styleUrls: ['./image.component.css']
})
export class ImageComponent implements OnInit, OnDestroy {
    public file?: string;
    public name?: string;
    public sha1?: string;
    private subs: any[] = [];
    private scraper?: ScraperService;

    constructor(private route: ActivatedRoute, private router: Router,
                private ws: WebsocketService, private keys: KeysService) { }

    ngOnInit(): void {
        let sub = this.route.params.subscribe(params => {
            this.file = params['file'];
            this.name = params['name'];
            this.sha1 = params['sha1'];
        });
        this.subs.push(sub);

        this.scraper = getScraperService(this.ws, this.keys);
    }

    ngOnDestroy() {
        for (let d of this.subs) {
            d.unsubscribe();
        }
        this.subs = [];
    }

    public back() {
        this.router.navigate(["/"]);
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

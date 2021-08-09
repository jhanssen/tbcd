import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WebsocketService } from '../websocket.service';
import { KeysService } from '../keys.service';
import { getScraperService, ScraperService, ScrapeImage } from '../scraper.service';

@Component({
    selector: 'app-scrape',
    templateUrl: './scrape.component.html',
    styleUrls: ['./scrape.component.css']
})
export class ScrapeComponent implements OnInit, OnDestroy {
    public name?: string;
    public sha1?: string;
    public selected?: string;
    public scraperName?: string;
    public status?: string;
    public candidates: ScrapeImage[] = [];

    private scraper?: ScraperService;
    private subs: any[] = [];

    constructor(private route: ActivatedRoute, private router: Router,
                private ws: WebsocketService, private keys: KeysService,
                private snackBar: MatSnackBar) {
    }

    ngOnInit(): void {
        this.status = "Initializing";
        let sub = this.route.params.subscribe(params => {
            this.name = params['name'];
            this.sha1 = params['sha1'];

            if (this.name !== undefined) {
                this.status = "Scraping";
                this.scraper = getScraperService(this.ws, this.keys);
                this.scraperName = this.scraper.name();
                this.scraper.scrape({ name: this.name }).then(response => {
                    this.candidates = response.candidates;
                    if (this.candidates.length === 0) {
                        this.status = "No results";
                    } else {
                        this.status = undefined;
                    }
                }).catch(e => {
                    this.status = "Scrape error";
                    console.error("scrape err", e);
                });
            } else {
                this.status = "No game name";
            }
        });
        this.subs.push(sub);
        sub = this.ws.onIdeOpen.subscribe(isopen => {
            if (!isopen)
                this.router.navigate(["/"]);
        });
        this.subs.push(sub);
        sub = this.ws.onWsOpen.subscribe(isopen => {
            if (!isopen)
                this.router.navigate(["/"]);
        });
        this.subs.push(sub);
    }

    ngOnDestroy() {
        for (let d of this.subs) {
            d.unsubscribe();
        }
        this.subs = [];
        this.name = undefined;
        this.sha1 = undefined;
        this.scraper = undefined;
        this.selected = undefined;
        this.candidates = [];
    }

    public select(image: string) {
        this.selected = image;
    }

    public isSelected(image: string) {
        return this.selected === image;
    }

    public save() {
        if (this.sha1 === undefined || this.selected === undefined)
            return;
        console.log("saving", this.selected);
        this.ws.fetch(this.selected).then(data => {
            this.ws.setBitmap(this.sha1, data).then(() => {
                this.snackBar.open("Saved", "Set Bitmap", { duration: 5000 });
            }).catch(e => {
                this.snackBar.open(`Failure ${e.message}`, "Set Bitmap", { duration: 5000 });
            });
        }).catch(e => {
            console.error("error fetching", e);
        });
    }

    public back() {
        this.router.navigate(["/"]);
    }
}

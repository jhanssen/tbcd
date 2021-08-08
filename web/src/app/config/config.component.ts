import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { WebsocketService } from '../websocket.service';
import { scraperCandidates, scraperDefault } from '../scraper.service';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html',
  styleUrls: ['./config.component.css']
})
export class ConfigComponent implements OnInit {
    public wsport: string;
    public scraper: string;
    public scraperCandidates: string[];

    constructor(private ws: WebsocketService, private router: Router) { }

    ngOnInit(): void {
        this.wsport = this.ws.port + "";
        this.scraper = this.getItem("scraper");
        if (!this.scraper)
            this.scraper = scraperDefault();
        this.scraperCandidates = scraperCandidates();
    }

    public save() {
        this.setItem("wsport", this.wsport);
        this.setItem("scraper", this.scraper);
        this.ws.port = parseInt(this.wsport, 10);
    }

    public back() {
        this.router.navigate(["/"]);
    }

    public validateWsPort(event: InputEvent) {
        const target = (event.target as HTMLInputElement)
        const newtext = target.value;
        const num = parseInt(newtext, 10);
        if (!newtext || (num >= 0 && num <= 65535 && (num + "") === newtext)) {
            this.wsport = newtext;
        } else {
            target.value = this.wsport;
        }
    }

    private getItem(item: string) {
        return window.localStorage.getItem(item) || "";
    }

    private setItem(item: string, value: string | undefined) {
        if (!value) {
            window.localStorage.removeItem(item);
        } else {
            window.localStorage.setItem(item, value);
        }
    }
}

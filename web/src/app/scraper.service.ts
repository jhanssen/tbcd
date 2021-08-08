import { WebsocketService } from './websocket.service';
import { KeysService } from './keys.service';

export interface ScrapeRequest {
    name: string;
    id?: string;
}

export interface ScrapeImage {
    image: string;
    thumbnail?: string;
}

export interface ScrapeResponse {
    primary?: ScrapeImage;
    candidates: ScrapeImage[];
}

export abstract class ScraperService {
    constructor(protected ws: WebsocketService, protected keys: KeysService) { }

    abstract scrape(request: ScrapeRequest): Promise<ScrapeResponse>;
    abstract name(): string;
}

class ScraperGoogleService extends ScraperService {
    constructor(protected ws: WebsocketService, protected keys: KeysService) {
        super(ws, keys);
    }

    scrape(request: ScrapeRequest): Promise<ScrapeResponse> {
        return new Promise((resolve, reject) => {
            this.keys.keys().then(keys => {
                if (keys.google === undefined)
                    throw new Error("no google key");
                const query = `q=${encodeURIComponent(request.name + " saturn cover")}&searchType=image&cx=${keys.google.cx}&key=${keys.google.key}`;
                const url = `https://www.googleapis.com/customsearch/v1?${query}`;
                fetch(url).then(data => data.json()).then(data => {
                    // console.log(data);
                    const items = data.items.map((item: any) => {
                        return {
                            image: item.link,
                            thumbnail: item.image.thumbnailLink
                        };
                    });
                    resolve({ candidates: items });
                }).catch(err => {
                    reject(err);
                });
            }).catch(e => {
                reject(e);
            });
        });
    }

    name() {
        return "google";
    }
}

class ScraperTheGamesDbService extends ScraperService {
    constructor(protected ws: WebsocketService, protected keys: KeysService) {
        super(ws, keys);
    }

    scrape(request: ScrapeRequest): Promise<ScrapeResponse> {
        return new Promise((resolve, reject) => {
            this.keys.keys().then(keys => {
                if (keys.thegamesdb === undefined)
                    throw new Error("no google key");
                const url = `https://api.thegamesdb.net/v1/Games/ByGameName?apikey=${keys.thegamesdb.key}&name=${encodeURIComponent(request.name)}`;
                this.ws.fetch(url, "utf8").then(data => {
                    const json = JSON.parse(data);
                    let gameids: string[] = [];
                    if (typeof json.data === "object" && json.data.games instanceof Array && json.data.games.length > 0) {
                        for (let i = 0; i < json.data.games.length; ++i) {
                            gameids.push(json.data.games[i].id);
                        }
                    }
                    if (gameids.length === 0) {
                        resolve({
                            candidates: []
                        });
                        return;
                    }
                    const imgurl = `https://api.thegamesdb.net/v1/Games/Images?apikey=${keys.thegamesdb.key}&games_id=${gameids.join(',')}`;
                    return this.ws.fetch(imgurl, "utf8");
                }).then(data => {
                    if (data === undefined)
                        return;
                    const json = JSON.parse(data);
                    const candidates: ScrapeImage[] = [];
                    if (typeof json.data === "object" && typeof json.data.images === "object") {
                        for (const gameid of Object.keys(json.data.images)) {
                            const game = json.data.images[gameid];
                            if (game instanceof Array) {
                                for (let i = 0; i < game.length; ++i) {
                                    const img = game[i];
                                    switch (img.type) {
                                    case "boxart":
                                        candidates.push({
                                            image: `https://cdn.thegamesdb.net/images/original/${img.filename}`
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    resolve({
                        candidates: candidates
                    });
                }).catch(err => {
                    reject(err);
                });
            }).catch(e => {
                reject(e);
            });
        });
    }

    name() {
        return "thegamesdb";
    }
}

const candidates = ["google", "thegamesdb"];

export function getScraperService(ws: WebsocketService, keys: KeysService) {
    const scraper = window.localStorage.getItem("scraper");
    if (scraper === "thegamesdb")
        return new ScraperTheGamesDbService(ws, keys);
    return new ScraperGoogleService(ws, keys);
}

export function setScraperService(name: string | undefined) {
    if (name === undefined) {
        window.localStorage.removeItem(name);
    } else {
        if (candidates.indexOf(name) === -1) {
            throw new Error(`invalid scraper ${name}`);
        }
        window.localStorage.setItem("scraper", name);
    }
}

export function scraperCandidates() {
    return candidates;
}

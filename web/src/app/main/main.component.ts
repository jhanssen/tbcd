import { Component, OnInit } from '@angular/core';
import { WebsocketService } from '../websocket.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit {

    constructor(private ws: WebsocketService) { }

    ngOnInit(): void {
        this.ws.images().then(imgs => {
            console.log("got imgs", imgs);
        });
        this.ws.onCurrentFile.subscribe(file => {
            console.log("new current", file);
        });
    }

}

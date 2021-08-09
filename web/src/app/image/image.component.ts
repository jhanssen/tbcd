import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { WebsocketService } from '../websocket.service';
import { placeholder } from '../main/placeholder';

@Component({
    selector: 'app-image-upload-dialog',
    templateUrl: './image.upload.component.html',
    styleUrls: ['./image.upload.component.css']
})
export class ImageUploadComponent {
    constructor(private dialogRef: MatDialogRef<ImageUploadComponent>) { }

    public uploadChange(event: any) {
        this.dialogRef.close({ file: event.target.files[0] });
    }
}

@Component({
    selector: 'app-image',
    templateUrl: './image.component.html',
    styleUrls: ['./image.component.css']
})
export class ImageComponent implements OnInit, OnDestroy {
    public modified: boolean = false;
    public file?: string;
    public name?: string;
    public sha1?: string;
    public imageData: string;
    private subs: any[] = [];

    constructor(private route: ActivatedRoute, private router: Router,
                private ws: WebsocketService, private dialog: MatDialog,
                private snackBar: MatSnackBar) { }

    ngOnInit(): void {
        let sub = this.route.params.subscribe(params => {
            this.file = params['file'];
            this.name = params['name'];
            this.sha1 = params['sha1'];
            this.modified = false;

            if (this.sha1 !== undefined) {
                this.fetchBitmap();
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

    public upload() {
        if (this.sha1 === undefined)
            return;
        const dialogRef = this.dialog.open(ImageUploadComponent);
        dialogRef.afterClosed().subscribe(result => {
            if (result === undefined || !result.file)
                return;
            const reader = new FileReader();
            reader.onload = () => {
                // console.log("file", reader.result);
                // do some sanity checking
                if (typeof reader.result !== "string") {
                    // can't happen?
                    return;
                }
                const brx = /^data:([^;]+);base64,/;
                const bd = brx.exec(reader.result);
                if (!bd) {
                    this.snackBar.open("Invalid upload", "Upload boxart", { duration: 5000 });
                    return;
                }
                // check for allowed image types
                switch (bd[1]) {
                case "image/jpeg":
                case "image/png":
                case "image/webp":
                case "image/tiff":
                case "image/gif":
                case "image/bmp":
                    const base64str = reader.result.substr(bd[0].length);
                    this.ws.setBitmap(this.sha1, base64str).then(() => {
                        this.snackBar.open("Uploaded", "Upload boxart", { duration: 5000 });
                        this.fetchBitmap();
                    }).catch(e => {
                        this.snackBar.open(`Failure ${e.message}`, "Upload boxart", { duration: 5000 });
                    });
                    break;
                default:
                    this.snackBar.open(`Unsupported image type: ${bd[1]}`, "Upload boxart", { duration: 5000 });
                    break;
                }
            };
            reader.readAsDataURL(result.file);
        });
    }

    public setName(event: InputEvent) {
        const newname = (event.target as HTMLInputElement).value;
        if (newname !== this.name) {
            this.name = newname;
            this.modified = true;
        }
    }

    public save() {
        this.modified = false;
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

    private fetchBitmap() {
        this.ws.bitmap(this.sha1).then(data => {
            this.imageData = data;
        }).catch(e => {
            console.error("bitmap error", e);
        });
    }
}

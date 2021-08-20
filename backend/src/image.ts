import sharp from "sharp";
import child_process from "child_process";

export function encodeGif(convpath: string, buffer: Buffer, bounds: number) {
    return new Promise<Buffer|undefined>((resolve, reject) => {
        const image = sharp(buffer);
        image
            .metadata()
            .then((metadata: { width?: number, height?: number }) => {
                if (bounds < 8) {
                    // boo
                    reject(new Error(`bounds too small ${bounds}`));
                    return;
                }
                if (metadata.width == undefined || metadata.width < 8 || metadata.height === undefined || metadata.height < 8) {
                    // boo some more
                    reject(new Error(`image width/height too small ${metadata.width}x${metadata.height}`));
                    return;
                }
                let w = bounds, h = bounds;
                // width needs to be a multiple of 8
                const ratio = metadata.width / metadata.height;
                if (ratio >= 1) {
                    // width > height
                    h = w / ratio;
                    const m = w % 8;
                    if (m > 0) {
                        // need to fix the width
                        w -= m;
                        // adjust height as well
                        h -= (m / ratio);
                    }
                } else {
                    // height > width
                    w = h * ratio;
                    const m = w % 8;
                    if (m > 0) {
                        w -= m;
                        h -= (m * ratio);
                    }
                }
                image
                    .resize(Math.floor(w), Math.floor(h))
                    .removeAlpha()
                    .png()
                    .toBuffer((err: Error, data: Buffer) => {
                        if (err) {
                            reject(err);
                        } else {
                            const gif = child_process.spawn(convpath, ["-colors", "192", "png:-", "gif:-"]);
                            const datas: Buffer[] = []
                            let done = false;
                            gif.stdout.on("data", (data: Buffer) => {
                                datas.push(data);
                            });
                            gif.on("close", () => {
                                if (done)
                                    return
                                done = true;
                                if (datas.length === 0) {
                                    resolve(undefined);
                                } else {
                                    resolve(Buffer.concat(datas));
                                }
                            });
                            gif.on("error", (e: Error) => {
                                if (done)
                                    return
                                done = true;
                                reject(e);
                            });
                            gif.stdin.write(data);
                            gif.stdin.end();
                        }
                    });
            });
    });
}

export function encodePng(data: Buffer, bounds?: number): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const image = sharp(data);
        if (!bounds) {
            image
                .png()
                .toBuffer()
                .then((data: Buffer) => {
                    resolve(data);
                }).catch(e => {
                    reject(e);
                });
        } else {
            image
                .metadata()
                .then((metadata: { width?: number, height?: number }) => {
                    if (bounds < 8) {
                        // boo
                        reject(new Error(`bounds too small ${bounds}`));
                        return;
                    }
                    if (metadata.width == undefined || metadata.width < 8 || metadata.height === undefined || metadata.height < 8) {
                        // boo some more
                        reject(new Error(`image width/height too small ${metadata.width}x${metadata.height}`));
                        return;
                    }
                    let w = bounds, h = bounds;
                    // width needs to be a multiple of 8
                    const ratio = metadata.width / metadata.height;
                    if (ratio >= 1) {
                        // width > height
                        h = w / ratio;
                        const m = w % 8;
                        if (m > 0) {
                            // need to fix the width
                            w -= m;
                            // adjust height as well
                            h -= (m / ratio);
                        }
                    } else {
                        // height > width
                        w = h * ratio;
                        const m = w % 8;
                        if (m > 0) {
                            w -= m;
                            h -= (m * ratio);
                        }
                    }
                    image
                        .resize(Math.floor(w), Math.floor(h))
                        .png()
                        .toBuffer()
                        .then((data: Buffer) => {
                            resolve(data);
                        }).catch(e => {
                            reject(e);
                        });
                });
        }
    });
}

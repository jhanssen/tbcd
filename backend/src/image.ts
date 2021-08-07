import sharp from "sharp";
import TGA from "tga";

export function convertToTga(buffer: Buffer, bounds: number) {
    return new Promise<Buffer>((resolve, reject) => {
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
                    .ensureAlpha()
                    .raw()
                    .toBuffer((err: Error, data: Buffer, info: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(TGA.createTgaBuffer(info.width, info.height, data));
                        }
                    });
            });
    });
}

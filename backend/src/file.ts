import fs from "fs/promises";
import path from "path";

export async function writeDataFile(writeDir: string, file: string, data: Buffer|string, encoding?: BufferEncoding) {
    await fs.writeFile(path.join(writeDir, file), data, { encoding: encoding ? encoding : null });
}

export async function readDataFile(writeDir: string, file: string, encoding?: BufferEncoding) {
    return await fs.readFile(path.join(writeDir, file), { encoding: encoding ? encoding : null });
}

export async function unlinkDataFile(writeDir: string, file: string) {
    await fs.unlink(path.join(writeDir, file));
}

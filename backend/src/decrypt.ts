import crypto from "crypto";

function unmagic(magic: number[], shift: number) {
    let str = "";
    for (let k = 0; k < magic.length; ++k) {
        str += String.fromCharCode(magic[k] >> shift);
    }
    return str;
}

export function decrypt(data: string)
{
    const iv = data.substr(0, 32);
    const enc = data.substr(32);
    // some good ol' security by obscurity
    const decipher = crypto.createDecipheriv('aes-256-ctr', unmagic([12800,12416,7296,12928,13440,15232,12416,13440,12544,13440,12928,6784,9728,12416,13440,6272,14336,13312,13440,12416,10752,13312,12928,14848,14208,12416,15616,14208,14208,12672,13312,14208], 7), Buffer.from(iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(enc, 'hex')), decipher.final()]);
    return decrypted.toString();
}

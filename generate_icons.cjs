const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const LOGO_SRC = path.join(__dirname, '..', 'Users', 'Kauan', 'boa wallet', 'BoaWallet', 'public', 'logo.png');
const ANDROID_RES = path.join(__dirname, '..', 'Users', 'Kauan', 'boa wallet', 'BoaWallet', 'android', 'app', 'src', 'main', 'res');

const SIZES = {
    'mipmap-ldpi': 36,
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
};

async function main() {
    const img = await loadImage(LOGO_SRC);

    for (const [folder, size] of Object.entries(SIZES)) {
        const dir = path.join(ANDROID_RES, folder);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // ic_launcher.png
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const buf = canvas.toBuffer('image/png');
        fs.writeFileSync(path.join(dir, 'ic_launcher.png'), buf);
        fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), buf);

        // foreground (108dp)
        const fgSize = Math.round(size * 108 / 48);
        const fgCanvas = createCanvas(fgSize, fgSize);
        const fgCtx = fgCanvas.getContext('2d');
        const padding = Math.round(fgSize * 0.2);
        fgCtx.drawImage(img, padding, padding, fgSize - padding * 2, fgSize - padding * 2);
        const fgBuf = fgCanvas.toBuffer('image/png');
        fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fgBuf);

        console.log(`Generated ${folder}: ${size}px`);
    }
    console.log('Done!');
}

main().catch(console.error);

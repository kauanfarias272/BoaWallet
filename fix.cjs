const fs = require('fs');
let b = fs.readFileSync('public/logo.png');
// Replace EF BF BD with 89 if it's there
if (b[0] === 0xef && b[1] === 0xbf && b[2] === 0xbd) {
    b[0] = 0x89;
    b.copyWithin(1, 3);
    b = b.slice(0, b.length - 2);
    fs.writeFileSync('public/logo_fixed.png', b);
    console.log('Fixed header!');
}

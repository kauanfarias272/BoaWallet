const fs = require('fs');
const b = fs.readFileSync('public/logo.png');
console.log('Hex:', b.slice(0, 8).toString('hex'));
console.log('String:', b.slice(0, 8).toString('utf8'));

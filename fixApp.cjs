const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /      useEffect\(\(\) => \{\n        if \(!subscriptions\.length\) return;[\s\S]*?setCancelPromptSub\(null\);\n      };\n/g;

code = code.replace(regex, '');
fs.writeFileSync('src/App.tsx', code);
console.log('Fixed App.tsx nested hooks!');

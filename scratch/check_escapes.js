const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'public', 'js', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

// Find all matches
const matches = [];
let index = code.indexOf('\\${');
while (index !== -1) {
  matches.push(index);
  index = code.indexOf('\\${', index + 1);
}

console.log(`Found ${matches.length} escaped template placeholders.`);

if (matches.length > 0) {
  // Replace all occurrences of \${ with ${
  code = code.replace(/\\\$\{/g, '${');
  fs.writeFileSync(filePath, code, 'utf8');
  console.log('Successfully replaced all occurrences of \\${ with ${.');
}

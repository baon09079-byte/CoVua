const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'node_modules', 'chess.js', 'dist', 'cjs', 'chess.js');
const destPath = path.join(__dirname, '..', '..', 'client', 'js', 'chess.js');

const code = fs.readFileSync(srcPath, 'utf8');
const wrapped = `/* Chess.js browser bundle */
(function(window) {
  var exports = {};
${code}
  window.Chess = exports.Chess;
  if (typeof module !== "undefined") {
    module.exports = exports;
  }
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.writeFileSync(destPath, wrapped, 'utf8');
console.log('Successfully bundled chess.js to:', destPath);


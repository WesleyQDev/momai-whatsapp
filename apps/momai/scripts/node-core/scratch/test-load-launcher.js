const path = require('node:path');
const runtimePath = 'c:\\Users\\wesle\\dev\\momai\\apps\\momai\\scripts\\skills\\packaged\\launcher\\runtime.js';
try {
  const runtime = require(runtimePath);
  console.log('Successfully required runtime');
} catch (err) {
  console.error('Failed to require runtime:', err);
}

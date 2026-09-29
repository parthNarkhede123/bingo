'use strict';

// PG Manager — placeholder server.
// Fresh start: this repo will grow into a system to help manage PG
// (paying-guest) accommodations. For now it just answers "Hello World" so the
// Render deploy stays green while the real system is built out.

const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Hello World — PG Manager\n');
});

server.listen(PORT, () => {
  console.log(`PG Manager listening on port ${PORT}`);
});

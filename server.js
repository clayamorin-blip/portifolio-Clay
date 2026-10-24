// Servidor simples para o Railway (sem dependências).
// Ele escuta na porta que o Railway informa (variável PORT); se não houver, usa 8080.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bin': 'application/octet-stream',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT) || /[\\/](tools|node_modules)[\\/]|server\.js$|package\.json$/.test(file.slice(ROOT.length))) {
    res.writeHead(404); return res.end('Não encontrado');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (path.extname(url)) { res.writeHead(404); return res.end('Não encontrado'); }
      // endereço sem extensão desconhecido volta para a página inicial
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(500); return res.end('Erro'); }
        res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(html);
      });
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`CLAYSP no ar na porta ${PORT}`));

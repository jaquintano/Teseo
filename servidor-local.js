// Servidor de desarrollo. NO forma parte de la aplicación: GitHub Pages no lo
// usa ni lo ejecuta. Sirve para probar los cambios en el móvil sin tener que
// subirlos a GitHub cada vez.
//
//   node servidor-local.js
//
// Luego abre en el móvil http://IP-DE-TU-ORDENADOR:8123 (el ordenador y el
// móvil tienen que estar en la misma wifi).

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const raiz = __dirname;
const puerto = Number(process.argv[2] || 8123);

const tipos = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

http.createServer((peticion, respuesta) => {
  let ruta = decodeURIComponent(peticion.url.split('?')[0]);
  if (ruta === '/') ruta = '/index.html';

  const destino = path.join(raiz, ruta);
  if (!destino.startsWith(raiz)) {
    respuesta.writeHead(403).end('prohibido');
    return;
  }

  fs.readFile(destino, (error, datos) => {
    if (error) {
      respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      respuesta.end('No encontrado: ' + ruta);
      return;
    }
    respuesta.writeHead(200, {
      'content-type': tipos[path.extname(destino)] || 'application/octet-stream',
      // Sin caché, para que al recargar en el móvil se vean los cambios.
      'cache-control': 'no-store',
    });
    respuesta.end(datos);
  });
}).listen(puerto, () => {
  console.log(`Teseo servido en el puerto ${puerto}.`);
  console.log('Direcciones para abrir desde el móvil:');
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const cara of interfaces) {
      if (cara.family === 'IPv4' && !cara.internal) {
        console.log(`  http://${cara.address}:${puerto}`);
      }
    }
  }
});

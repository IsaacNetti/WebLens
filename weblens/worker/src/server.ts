import { createServer } from 'node:http';

import { handleScanRoutes } from './routes/scans';

const port = Number(process.env.PORT ?? 3001);

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const handled = await handleScanRoutes(req, res);

  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

server.listen(port, () => {
  console.log(`Worker listening on http://localhost:${port}`);
});

const http = require('http');
const QRCode = require('qrcode');

const GATEWAY_PORT = process.env.PORT || 3000;
const METRO_PORT = 8080;

const QR_HTML = (qrDataUrl, expUrl) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>FlingVibe — Open in Expo Go</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px 32px;max-width:420px;width:100%;text-align:center}
    h1{font-size:22px;font-weight:700;color:#111;margin:0 0 6px}
    .sub{font-size:14px;color:#888;margin-bottom:28px}
    img{display:block;margin:0 auto 24px;border-radius:12px;width:240px;height:240px}
    .note{font-size:13px;color:#555;line-height:1.6;margin-bottom:20px}
    a.btn{display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:12px}
    a.btn:hover{background:#4338ca}
    .foot{margin-top:16px;font-size:11px;color:#bbb}
  </style>
</head>
<body>
  <div class="card">
    <h1>📱 FlingVibe Mobile</h1>
    <p class="sub">Scan with Expo Go to open on your phone</p>
    <img src="${qrDataUrl}" alt="Expo Go QR Code"/>
    <p class="note">Open <strong>Expo Go</strong> on iOS or Android,<br>tap <strong>Scan QR Code</strong>, and point it here.</p>
    <a class="btn" href="${expUrl}">Open in Expo Go</a>
    <p class="foot">Powered by Expo &amp; React Native</p>
  </div>
</body>
</html>`;

async function main() {
  const host = process.env.REPLIT_DEV_DOMAIN || process.env.HOSTNAME || 'localhost';
  const expUrl = `exp://${host}`;

  const qrDataUrl = await QRCode.toDataURL(expUrl, {
    width: 480,
    margin: 2,
    color: { dark: '#111111', light: '#ffffff' },
  });

  const qrHtml = QR_HTML(qrDataUrl, expUrl);

  const server = http.createServer((req, res) => {
    const isBrowserRoot = req.url === '/' && (req.headers['accept'] || '').includes('text/html');

    if (isBrowserRoot) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(qrHtml);
      return;
    }

    // Proxy all Expo Go / Metro requests to the internal Metro bundler
    const proxyReq = http.request(
      {
        host: '127.0.0.1',
        port: METRO_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', () => {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Metro bundler is starting up, please try again in a moment.');
    });

    req.pipe(proxyReq);
  });

  server.listen(GATEWAY_PORT, '0.0.0.0', () => {
    console.log(`Gateway running on :${GATEWAY_PORT}`);
    console.log(`Proxying Expo Go requests → Metro on :${METRO_PORT}`);
    console.log(`Expo Go link: ${expUrl}`);
  });
}

main().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});

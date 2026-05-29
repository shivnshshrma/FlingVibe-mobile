const http = require('http');
const { spawn } = require('child_process');
const QRCode = require('qrcode');

const GATEWAY_PORT = process.env.PORT || 3000;
const METRO_PORT = 19001; // fixed internal port — never exposed externally

// ─── Start Metro as a child process ────────────────────────────────────────
// We spawn it here (not in the shell run command) so Replit cannot detect
// the Metro port and mistakenly route external traffic to it.
const metro = spawn(
  'npx',
  ['expo', 'start', '--port', String(METRO_PORT)],
  {
    env: {
      ...process.env,
      EXPO_PACKAGER_PROXY_URL: `https://${process.env.REACT_NATIVE_PACKAGER_HOSTNAME || 'localhost'}`,
    },
    stdio: 'inherit',
    shell: false,
  }
);
metro.on('error', err => console.error('Metro spawn error:', err.message));
metro.on('exit', code => console.log('Metro exited with code', code));

// ─── QR code generation ─────────────────────────────────────────────────────
const qrCache = new Map();

async function getQr(host) {
  if (qrCache.has(host)) return qrCache.get(host);
  const expUrl = `exps://${host}`;
  const qrDataUrl = await QRCode.toDataURL(expUrl, {
    width: 480,
    margin: 2,
    color: { dark: '#111111', light: '#ffffff' },
  });
  const result = { expUrl, qrDataUrl };
  qrCache.set(host, result);
  return result;
}

const buildHtml = (qrDataUrl, expUrl) => `<!DOCTYPE html>
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

// ─── URL rewriting ───────────────────────────────────────────────────────────
// Rewrites any internal Metro addresses in manifest/JS so Expo Go fetches
// bundles from the correct public HTTPS URL, not localhost:19001
function rewriteBody(body, publicHost) {
  const mp = String(METRO_PORT);
  return body
    .replace(new RegExp(`https?://${publicHost.replace(/\./g, '\\.')}:${mp}`, 'g'), `https://${publicHost}`)
    .replace(new RegExp(`${publicHost.replace(/\./g, '\\.')}:${mp}`, 'g'), publicHost)
    .replace(new RegExp(`http://localhost:${mp}`, 'g'), `https://${publicHost}`)
    .replace(new RegExp(`http://127\\.0\\.0\\.1:${mp}`, 'g'), `https://${publicHost}`)
    .replace(new RegExp(`localhost:${mp}`, 'g'), publicHost)
    .replace(new RegExp(`127\\.0\\.0\\.1:${mp}`, 'g'), publicHost);
}

// ─── Gateway HTTP server ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const publicHost = process.env.REACT_NATIVE_PACKAGER_HOSTNAME
    || req.headers['host']
    || 'localhost';

  const isExpoGoRequest = req.headers['expo-platform']
    || req.headers['expo-sdk-version']
    || req.headers['expo-runtime-version'];

  if (req.url === '/') {
    if (isExpoGoRequest) {
      // Genuine Expo Go manifest request — proxy to Metro below
    } else {
      // All other root requests (browsers, iframes, health checks) → QR page
      try {
        const { qrDataUrl, expUrl } = await getQr(publicHost);
        console.log(`QR → exps://${publicHost}`);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildHtml(qrDataUrl, expUrl));
      } catch (err) {
        res.writeHead(500);
        res.end('QR generation failed: ' + err.message);
      }
      return;
    }
  }

  // Proxy Expo Go manifest + bundle requests to Metro
  const proxyReq = http.request(
    {
      host: '127.0.0.1',
      port: METRO_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${METRO_PORT}` },
    },
    (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      const needsRewrite = contentType.includes('application/json')
        || contentType.includes('application/expo')
        || contentType.includes('text/javascript')
        || contentType.includes('application/javascript');

      if (needsRewrite) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', () => {
          const original = Buffer.concat(chunks).toString('utf8');
          const rewritten = rewriteBody(original, publicHost);
          const headers = { ...proxyRes.headers, 'content-length': Buffer.byteLength(rewritten) };
          delete headers['content-encoding'];
          res.writeHead(proxyRes.statusCode, headers);
          res.end(rewritten);
        });
      } else {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    }
  );

  proxyReq.on('error', () => {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Metro is starting up, please try again in a moment.');
  });

  req.pipe(proxyReq);
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`Gateway on :${GATEWAY_PORT} → Metro on :${METRO_PORT}`);
});

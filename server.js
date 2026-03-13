/**
 * VigiSaúde Brasil — Production server
 * Serves the Vite build (dist/) and proxies InfoDengue API to avoid CORS.
 */
import express from 'express';
import https from 'https';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Proxy /api/infodengue/* → https://info.dengue.mat.br/api/*
app.use('/api/infodengue', (req, res) => {
    const targetPath = '/api' + req.url;
    const options = {
        hostname: 'info.dengue.mat.br',
        port: 443,
        path: targetPath,
        method: req.method,
        headers: { Accept: 'application/json' },
    };

    const proxyReq = https.request(options, (proxyRes) => {
        res.status(proxyRes.statusCode);
        for (const [key, val] of Object.entries(proxyRes.headers)) {
            if (key.toLowerCase() !== 'transfer-encoding') res.setHeader(key, val);
        }
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        res.status(502).json({ error: 'Proxy error', detail: err.message });
    });

    proxyReq.end();
});

// Serve Vite build
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`VSB Dashboard running on port ${PORT}`);
});

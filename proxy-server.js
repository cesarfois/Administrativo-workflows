import express from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const PORT = 3001;

// Enable CORS for all routes
app.use(cors({
    origin: true, // Reflect origin
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-target-url']
}));

// Handle OPTIONS preflight requests directly
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Proxy Options
const proxyOptions = {
    router: (req) => {
        // Get the target URL from the custom header
        const targetUrl = req.headers['x-target-url'];
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Proxy] Incoming request: ${req.method} ${req.url}`);
        console.log(`[${timestamp}] [Proxy] Headers:`, JSON.stringify(req.headers, null, 2));

        if (!targetUrl) {
            console.error(`[${timestamp}] [Proxy] ❌ Missing X-Target-URL header on ${req.method} ${req.url}`);
            // For non-OPTIONS requests, this is fatal
            throw new Error('Missing X-Target-URL header');
        }
        console.log(`[${timestamp}] [Proxy] ✅ Routing to: ${targetUrl}`);
        return targetUrl; // The proxy will forward to this URL
    },
    changeOrigin: true,
    secure: false, // Don't verify SSL certificates
    onProxyReq: (proxyReq, req, res) => {
        // Log forwarding
        const target = req.headers['x-target-url'];
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Proxy] 📤 Forwarding ${req.method} ${req.originalUrl} -> ${target}`);

        // Remove the custom header before forwarding to the target (cleanliness)
        proxyReq.removeHeader('x-target-url');
        proxyReq.removeHeader('origin'); // Let changeOrigin handle this
    },
    onProxyRes: (proxyRes, req, res) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [Proxy] 📥 Response ${proxyRes.statusCode} for ${req.method} ${req.url}`);
    },
    onError: (err, req, res) => {
        const timestamp = new Date().toISOString();
        console.error(`[${timestamp}] [Proxy] ❌ Error:`, err.message);
        res.status(500).json({ error: 'Proxy Error', details: err.message });
    }
};

// Route matching
// 1. Platform API requests - Needs pathRewrite to restore /DocuWare prefix
app.use('/DocuWare', createProxyMiddleware({
    ...proxyOptions,
    pathRewrite: {
        '^/': '/DocuWare/' // Add back /DocuWare prefix that Express strips
    }
}));

// 2. Identity/Token requests - No rewrite needed (prefix /docuware-proxy matches local only)
app.use('/docuware-proxy', createProxyMiddleware(proxyOptions));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dynamic Proxy Server running on http://0.0.0.0:${PORT}`);
});

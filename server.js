const http = require('http');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://nganesh:Mj4fl7nkVNetGDFm@cluster0.iazh4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'release-tracker';
const COLLECTION = 'appstate';
const DOC_ID = 'main';
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

let client;
let db;

async function connectMongo() {
    client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 30000,
    });
    await client.connect();
    db = client.db(DB_NAME);

    client.on('error', err => {
        console.error('MongoDB client error:', err.message);
    });
    client.on('close', () => {
        console.warn('MongoDB connection closed — will reconnect on next request');
        db = null;
    });

    console.log('Connected to MongoDB Atlas');
}

async function getDb() {
    if (db) return db;
    console.log('Reconnecting to MongoDB...');
    await connectMongo();
    return db;
}

function send(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                req.destroy();
                return reject(new Error('Request body too large'));
            }
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function safeStaticPath(url) {
    // Resolve to an absolute path and ensure it stays within __dirname
    const decoded = decodeURIComponent(url === '/' ? '/Release.html' : url);
    const resolved = path.resolve(__dirname, '.' + decoded);
    if (!resolved.startsWith(__dirname + path.sep) && resolved !== __dirname) {
        return null; // path traversal attempt
    }
    return resolved;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // POST /save — write all data to MongoDB
    if (req.method === 'POST' && req.url === '/save') {
        let body;
        try {
            body = await readBody(req);
        } catch (e) {
            return send(res, 413, { ok: false, error: e.message });
        }
        try {
            const parsed = JSON.parse(body);
            const col = (await getDb()).collection(COLLECTION);
            await col.replaceOne(
                { _id: DOC_ID },
                { _id: DOC_ID, ...parsed },
                { upsert: true }
            );
            return send(res, 200, { ok: true });
        } catch (e) {
            console.error('Save error:', e.message);
            return send(res, e instanceof SyntaxError ? 400 : 500, { ok: false, error: e.message });
        }
    }

    // GET /data — load from MongoDB
    if (req.method === 'GET' && req.url === '/data') {
        try {
            const col = (await getDb()).collection(COLLECTION);
            const doc = await col.findOne({ _id: DOC_ID });
            if (!doc) {
                return send(res, 404, { ok: false });
            }
            const { _id, ...data } = doc;
            return send(res, 200, data);
        } catch (e) {
            console.error('Load error:', e.message);
            return send(res, 500, { ok: false, error: e.message });
        }
    }

    // Static file serving — with path traversal protection
    const filePath = safeStaticPath(req.url);
    if (!filePath) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

function shutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully`);
    server.close(async () => {
        if (client) await client.close();
        process.exit(0);
    });
    // Force exit if graceful shutdown stalls
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

connectMongo().then(() => {
    server.listen(PORT, () => {
        console.log(`Release Tracker running at http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
});

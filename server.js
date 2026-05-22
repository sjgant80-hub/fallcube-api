// ═══════════════════════════════════════════════════════════════
// FallCube API — Sovereign File Storage
// Upload. Search. Analyze. Stream. Zero cloud dependency.
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3004;
const ADMIN_KEY = process.env.ADMIN_KEY || 'fc_admin_' + crypto.randomBytes(16).toString('hex');
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '.storage');
const META_DIR = path.join(STORAGE_DIR, '.meta');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB) || 100; // MB
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 120;

// AI providers for file analysis
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    url: 'https://api.anthropic.com/v1/messages',
    models: { fast: 'claude-haiku-4-20250414', best: 'claude-sonnet-4-20250514' },
    key: () => process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    name: 'OpenAI (GPT)',
    url: 'https://api.openai.com/v1/chat/completions',
    models: { fast: 'gpt-4o-mini', best: 'gpt-4o' },
    key: () => process.env.OPENAI_API_KEY,
  },
  google: {
    name: 'Google (Gemini)',
    urlBase: 'https://generativelanguage.googleapis.com/v1beta/models/',
    models: { fast: 'gemini-2.0-flash', best: 'gemini-2.5-flash' },
    key: () => process.env.GOOGLE_API_KEY,
  },
};

// ─── Init Storage ────────────────────────────────────────────
fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(META_DIR, { recursive: true });

// ─── Key Management ──────────────────────────────────────────
const apiKeys = new Map();
const KEY_FILE = path.join(META_DIR, 'keys.json');

function loadKeys() {
  try {
    const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    data.forEach(k => apiKeys.set(k.key, k));
  } catch { /* first run */ }
}

function saveKeys() {
  fs.writeFileSync(KEY_FILE, JSON.stringify([...apiKeys.values()], null, 2));
}

function generateKey(prefix = 'fc_p') {
  return `${prefix}_${crypto.randomBytes(20).toString('hex')}`;
}

loadKeys();

// ─── File Metadata Index ─────────────────────────────────────
const fileIndex = new Map();
const INDEX_FILE = path.join(META_DIR, 'index.json');

function loadIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    data.forEach(f => fileIndex.set(f.id, f));
  } catch { /* first run */ }
}

function saveIndex() {
  fs.writeFileSync(INDEX_FILE, JSON.stringify([...fileIndex.values()], null, 2));
}

function getFilePath(fileId, ext) {
  // Two-level hash directory to avoid huge flat dirs
  const hash = crypto.createHash('md5').update(fileId).digest('hex');
  const dir = path.join(STORAGE_DIR, hash.slice(0, 2), hash.slice(2, 4));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${fileId}.${ext}`);
}

loadIndex();

// ─── Express ─────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE * 1024 * 1024 },
});

// Rate limiter
const rateLimiter = new RateLimiterMemory({
  points: RATE_LIMIT,
  duration: 60,
});

// ─── Middleware ──────────────────────────────────────────────
function authenticate(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key) return res.status(401).json({ error: 'Missing API key. Set x-api-key header.' });

  if (key === ADMIN_KEY) {
    req.role = 'admin';
    req.keyId = 'admin';
    return next();
  }

  const keyData = apiKeys.get(key);
  if (!keyData) return res.status(401).json({ error: 'Invalid API key.' });

  req.role = keyData.role || 'user';
  req.keyId = keyData.id;
  req.keyData = keyData;
  next();
}

async function rateLimit(req, res, next) {
  try {
    await rateLimiter.consume(req.keyId || req.ip);
    next();
  } catch {
    res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });
  }
}

function adminOnly(req, res, next) {
  if (req.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// ─── File Type Intelligence ──────────────────────────────────
const FILE_CATEGORIES = {
  document: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pptx', 'xlsx', 'csv', 'xls'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff'],
  code: ['js', 'ts', 'py', 'html', 'css', 'json', 'sh', 'rb', 'go', 'java', 'cpp', 'c', 'rs', 'toml', 'yaml', 'yml', 'xml', 'sql'],
  media: ['mp4', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm'],
  archive: ['zip', 'tar', 'gz', 'rar', '7z', 'bz2'],
  data: ['json', 'csv', 'xml', 'parquet', 'sqlite', 'db'],
};

function categorize(ext) {
  ext = (ext || '').toLowerCase();
  for (const [cat, exts] of Object.entries(FILE_CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

const MIME_MAP = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
  json: 'application/json', html: 'text/html', css: 'text/css',
  js: 'text/javascript', py: 'text/x-python',
  zip: 'application/zip', gz: 'application/gzip',
};

function getMime(ext) {
  return MIME_MAP[(ext || '').toLowerCase()] || 'application/octet-stream';
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Health ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  const totalFiles = fileIndex.size;
  let totalBytes = 0;
  for (const f of fileIndex.values()) totalBytes += f.bytes || 0;

  res.json({
    service: 'fallcube-api',
    version: '1.0.0',
    status: 'operational',
    tagline: 'Sovereign File Storage. Your files. Your server. Zero cloud.',
    stats: {
      files: totalFiles,
      storage: formatSize(totalBytes),
      bytes: totalBytes,
    },
    endpoints: {
      upload: 'POST /upload',
      files: 'GET /files',
      file: 'GET /files/:id',
      download: 'GET /files/:id/download',
      delete: 'DELETE /files/:id',
      update: 'PATCH /files/:id',
      analyze: 'POST /files/:id/analyze',
      batch: 'POST /upload/batch',
      search: 'GET /search?q=...',
      stats: 'GET /stats',
      keys: 'POST /admin/keys (admin)',
    },
    sovereign: true,
  });
});

// ─── Upload Single File ──────────────────────────────────────
app.post('/upload', authenticate, rateLimit, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided. Send as multipart/form-data with field name "file".' });

  const id = uuidv4();
  const originalName = req.file.originalname;
  const parts = originalName.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  const baseName = parts.join('.') || originalName;
  const filePath = getFilePath(id, ext || 'bin');

  // Write file to disk
  fs.writeFileSync(filePath, req.file.buffer);

  // Compute hash
  const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

  // Build metadata
  const meta = {
    id,
    name: baseName,
    ext,
    originalName,
    mimeType: req.file.mimetype || getMime(ext),
    bytes: req.file.size,
    size: formatSize(req.file.size),
    category: categorize(ext),
    hash,
    starred: false,
    tags: req.body?.tags ? (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(t => t.trim())) : [],
    folder: req.body?.folder || null,
    uploadedBy: req.keyId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    path: filePath,
  };

  fileIndex.set(id, meta);
  saveIndex();

  // Return metadata (without internal path)
  const { path: _, ...publicMeta } = meta;
  res.status(201).json({
    success: true,
    file: publicMeta,
  });
});

// ─── Upload Batch ────────────────────────────────────────────
app.post('/upload/batch', authenticate, rateLimit, upload.array('files', 20), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files provided. Send as multipart/form-data with field name "files".' });

  const results = [];
  const folder = req.body?.folder || null;
  const tags = req.body?.tags ? (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(t => t.trim())) : [];

  for (const file of req.files) {
    const id = uuidv4();
    const parts = file.originalname.split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
    const baseName = parts.join('.') || file.originalname;
    const filePath = getFilePath(id, ext || 'bin');

    fs.writeFileSync(filePath, file.buffer);
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const meta = {
      id, name: baseName, ext, originalName: file.originalname,
      mimeType: file.mimetype || getMime(ext), bytes: file.size,
      size: formatSize(file.size), category: categorize(ext),
      hash, starred: false, tags: [...tags], folder,
      uploadedBy: req.keyId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      path: filePath,
    };

    fileIndex.set(id, meta);
    const { path: _, ...publicMeta } = meta;
    results.push(publicMeta);
  }

  saveIndex();

  res.status(201).json({
    success: true,
    count: results.length,
    files: results,
  });
});

// ─── List / Filter Files ─────────────────────────────────────
app.get('/files', authenticate, rateLimit, (req, res) => {
  let files = [...fileIndex.values()];

  // Filters
  const { category, ext, folder, starred, tag, sort, order, limit, offset } = req.query;

  if (category) files = files.filter(f => f.category === category);
  if (ext) files = files.filter(f => f.ext === ext.toLowerCase());
  if (folder) files = files.filter(f => f.folder === folder);
  if (starred === 'true') files = files.filter(f => f.starred);
  if (tag) files = files.filter(f => f.tags && f.tags.includes(tag));

  // Sort
  const sortField = sort || 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;
  files.sort((a, b) => {
    if (sortField === 'name') return sortOrder * a.name.localeCompare(b.name);
    if (sortField === 'bytes' || sortField === 'size') return sortOrder * ((a.bytes || 0) - (b.bytes || 0));
    if (sortField === 'ext') return sortOrder * (a.ext || '').localeCompare(b.ext || '');
    // Default: date
    return sortOrder * (new Date(b.createdAt) - new Date(a.createdAt));
  });

  // Pagination
  const total = files.length;
  const off = parseInt(offset) || 0;
  const lim = Math.min(parseInt(limit) || 100, 500);
  files = files.slice(off, off + lim);

  // Strip internal paths
  const publicFiles = files.map(({ path: _, ...f }) => f);

  res.json({
    files: publicFiles,
    total,
    offset: off,
    limit: lim,
    hasMore: off + lim < total,
  });
});

// ─── Search ──────────────────────────────────────────────────
app.get('/search', authenticate, rateLimit, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.status(400).json({ error: 'Query parameter "q" required.' });

  let files = [...fileIndex.values()];

  files = files.filter(f =>
    f.name.toLowerCase().includes(q) ||
    f.ext.toLowerCase().includes(q) ||
    f.category.includes(q) ||
    (f.originalName || '').toLowerCase().includes(q) ||
    (f.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (f.folder || '').toLowerCase().includes(q)
  );

  // Relevance scoring
  files = files.map(f => {
    let score = 0;
    if (f.name.toLowerCase() === q) score += 100;
    if (f.name.toLowerCase().startsWith(q)) score += 50;
    if (f.name.toLowerCase().includes(q)) score += 20;
    if (f.ext === q) score += 30;
    if ((f.tags || []).includes(q)) score += 25;
    return { ...f, _score: score };
  }).sort((a, b) => b._score - a._score);

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const publicFiles = files.slice(0, limit).map(({ path: _, _score, ...f }) => f);

  res.json({
    query: q,
    results: publicFiles,
    total: files.length,
  });
});

// ─── Get File Metadata ───────────────────────────────────────
app.get('/files/:id', authenticate, rateLimit, (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  const { path: _, ...publicMeta } = meta;
  res.json({ file: publicMeta });
});

// ─── Download File ───────────────────────────────────────────
app.get('/files/:id/download', authenticate, rateLimit, (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  if (!fs.existsSync(meta.path)) {
    return res.status(404).json({ error: 'File data missing from storage.' });
  }

  const filename = `${meta.name}.${meta.ext}`;
  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', meta.bytes);

  const stream = fs.createReadStream(meta.path);
  stream.pipe(res);
});

// ─── Stream File (inline) ────────────────────────────────────
app.get('/files/:id/stream', authenticate, rateLimit, (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  if (!fs.existsSync(meta.path)) {
    return res.status(404).json({ error: 'File data missing from storage.' });
  }

  res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${meta.name}.${meta.ext}"`);

  // Range request support for media streaming
  const stat = fs.statSync(meta.path);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', chunkSize);

    const stream = fs.createReadStream(meta.path, { start, end });
    stream.pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(meta.path).pipe(res);
  }
});

// ─── Update File Metadata ────────────────────────────────────
app.patch('/files/:id', authenticate, rateLimit, (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  const { name, starred, tags, folder } = req.body;

  if (name !== undefined) meta.name = name;
  if (starred !== undefined) meta.starred = !!starred;
  if (tags !== undefined) meta.tags = Array.isArray(tags) ? tags : [tags];
  if (folder !== undefined) meta.folder = folder || null;

  meta.updatedAt = new Date().toISOString();
  saveIndex();

  const { path: _, ...publicMeta } = meta;
  res.json({ success: true, file: publicMeta });
});

// ─── Delete File ─────────────────────────────────────────────
app.delete('/files/:id', authenticate, rateLimit, (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  // Remove file from disk
  try { fs.unlinkSync(meta.path); } catch { /* already gone */ }

  fileIndex.delete(req.params.id);
  saveIndex();

  res.json({ success: true, deleted: req.params.id });
});

// ─── Delete Batch ────────────────────────────────────────────
app.post('/files/delete-batch', authenticate, rateLimit, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Provide "ids" array.' });

  const deleted = [];
  const notFound = [];

  for (const id of ids) {
    const meta = fileIndex.get(id);
    if (!meta) { notFound.push(id); continue; }
    try { fs.unlinkSync(meta.path); } catch {}
    fileIndex.delete(id);
    deleted.push(id);
  }

  saveIndex();

  res.json({ success: true, deleted, notFound });
});

// ─── Folders ─────────────────────────────────────────────────
app.get('/folders', authenticate, rateLimit, (req, res) => {
  const folders = new Map();

  for (const f of fileIndex.values()) {
    const folder = f.folder || '/';
    if (!folders.has(folder)) {
      folders.set(folder, { name: folder, count: 0, bytes: 0 });
    }
    const entry = folders.get(folder);
    entry.count++;
    entry.bytes += f.bytes || 0;
  }

  const result = [...folders.values()].map(f => ({
    ...f,
    size: formatSize(f.bytes),
  }));

  res.json({ folders: result });
});

app.post('/folders', authenticate, rateLimit, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name required.' });

  res.status(201).json({
    success: true,
    folder: { name: name.trim(), count: 0, bytes: 0, size: '0 B' },
  });
});

// ─── Move Files ──────────────────────────────────────────────
app.post('/files/move', authenticate, rateLimit, (req, res) => {
  const { ids, folder } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Provide "ids" array.' });

  const moved = [];
  for (const id of ids) {
    const meta = fileIndex.get(id);
    if (meta) {
      meta.folder = folder || null;
      meta.updatedAt = new Date().toISOString();
      moved.push(id);
    }
  }

  saveIndex();
  res.json({ success: true, moved, folder: folder || '/' });
});

// ─── Duplicate File ──────────────────────────────────────────
app.post('/files/:id/duplicate', authenticate, rateLimit, (req, res) => {
  const original = fileIndex.get(req.params.id);
  if (!original) return res.status(404).json({ error: 'File not found.' });

  const id = uuidv4();
  const newPath = getFilePath(id, original.ext || 'bin');

  // Copy file data
  if (fs.existsSync(original.path)) {
    fs.copyFileSync(original.path, newPath);
  }

  const meta = {
    ...original,
    id,
    name: `Copy of ${original.name}`,
    starred: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    uploadedBy: req.keyId,
    path: newPath,
  };

  fileIndex.set(id, meta);
  saveIndex();

  const { path: _, ...publicMeta } = meta;
  res.status(201).json({ success: true, file: publicMeta });
});

// ─── AI Analysis ─────────────────────────────────────────────
app.post('/files/:id/analyze', authenticate, rateLimit, async (req, res) => {
  const meta = fileIndex.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'File not found.' });

  const provider = getAvailableProvider(req.body?.provider);
  if (!provider) {
    return res.status(503).json({
      error: 'No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY.',
    });
  }

  const quality = req.body?.quality || 'fast';
  const prompt = req.body?.prompt || null;

  // Read file for analysis
  let fileContent = '';
  let isImage = false;
  let imageBase64 = null;
  let imageMime = null;

  if (['image'].includes(meta.category)) {
    isImage = true;
    const buffer = fs.readFileSync(meta.path);
    imageBase64 = buffer.toString('base64');
    imageMime = meta.mimeType;
  } else if (['document', 'code', 'data'].includes(meta.category)) {
    try {
      fileContent = fs.readFileSync(meta.path, 'utf8').slice(0, 50000);
    } catch {
      return res.status(400).json({ error: 'Cannot read file content for analysis.' });
    }
  } else {
    return res.status(400).json({ error: `Cannot analyze ${meta.category} files. Supported: documents, images, code, data files.` });
  }

  const systemPrompt = `You are FallCube AI — a sovereign file analysis engine. Analyze the provided file and return structured intelligence.

For each file, produce:
1. SUMMARY — What this file is and what it contains (2-3 sentences)
2. KEY ENTITIES — Named entities, important values, dates, amounts, identifiers
3. STRUCTURE — How the content is organized
4. INSIGHTS — Non-obvious patterns, potential issues, quality assessment
5. TAGS — Suggested tags for filing/organization (array of lowercase strings)
6. ACTIONS — Recommended next actions (e.g., "verify totals", "cross-reference with...")

Respond in valid JSON with these exact keys: summary, entities, structure, insights, tags, actions.`;

  const userPrompt = prompt
    ? `Analyze this file with the following focus: ${prompt}\n\nFile: ${meta.name}.${meta.ext} (${meta.size})\n\n${isImage ? '[Image attached]' : fileContent}`
    : `Analyze this file:\n\nFile: ${meta.name}.${meta.ext} (${meta.size}, ${meta.category})\n\n${isImage ? '[Image attached]' : fileContent}`;

  try {
    const startTime = Date.now();
    const result = await callLLM(provider, quality, systemPrompt, userPrompt, {
      imageBase64, imageMime,
    });

    // Try to parse as JSON
    let analysis;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result };
    } catch {
      analysis = { raw: result };
    }

    // Store analysis on file metadata
    meta.analysis = analysis;
    meta.analyzedAt = new Date().toISOString();
    meta.analyzedBy = provider;
    meta.updatedAt = new Date().toISOString();
    saveIndex();

    res.json({
      success: true,
      file: req.params.id,
      provider,
      quality,
      ms: Date.now() - startTime,
      analysis,
    });

  } catch (err) {
    res.status(500).json({ error: 'Analysis failed: ' + err.message });
  }
});

// ─── Stats ───────────────────────────────────────────────────
app.get('/stats', authenticate, rateLimit, (req, res) => {
  const files = [...fileIndex.values()];
  let totalBytes = 0;
  const categories = {};
  const extensions = {};
  const byMonth = {};

  for (const f of files) {
    totalBytes += f.bytes || 0;

    categories[f.category] = (categories[f.category] || 0) + 1;

    const ext = f.ext || 'none';
    extensions[ext] = (extensions[ext] || 0) + 1;

    const month = (f.createdAt || '').slice(0, 7);
    if (month) byMonth[month] = (byMonth[month] || 0) + 1;
  }

  // Top extensions
  const topExtensions = Object.entries(extensions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ext, count]) => ({ ext, count }));

  res.json({
    total: files.length,
    storage: {
      bytes: totalBytes,
      formatted: formatSize(totalBytes),
    },
    categories,
    topExtensions,
    uploads: byMonth,
    starred: files.filter(f => f.starred).length,
    analyzed: files.filter(f => f.analysis).length,
    ai: {
      providers: Object.entries(PROVIDERS)
        .filter(([, p]) => p.key())
        .map(([id, p]) => ({ id, name: p.name })),
    },
  });
});

// ─── Admin: Key Management ───────────────────────────────────
app.post('/admin/keys', authenticate, adminOnly, (req, res) => {
  const { name, role } = req.body;
  const key = generateKey();
  const keyData = {
    id: uuidv4(),
    key,
    name: name || 'Unnamed Key',
    role: role || 'user',
    createdAt: new Date().toISOString(),
    requests: 0,
  };

  apiKeys.set(key, keyData);
  saveKeys();

  res.status(201).json({ success: true, key: keyData });
});

app.get('/admin/keys', authenticate, adminOnly, (req, res) => {
  const keys = [...apiKeys.values()].map(k => ({
    id: k.id,
    name: k.name,
    role: k.role,
    prefix: k.key.slice(0, 10) + '...',
    createdAt: k.createdAt,
  }));
  res.json({ keys });
});

app.delete('/admin/keys/:id', authenticate, adminOnly, (req, res) => {
  let deleted = false;
  for (const [key, data] of apiKeys.entries()) {
    if (data.id === req.params.id) {
      apiKeys.delete(key);
      deleted = true;
      break;
    }
  }

  if (!deleted) return res.status(404).json({ error: 'Key not found.' });

  saveKeys();
  res.json({ success: true, deleted: req.params.id });
});

// ─── LLM Call Abstraction ────────────────────────────────────
function getAvailableProvider(preferred) {
  if (preferred && PROVIDERS[preferred] && PROVIDERS[preferred].key()) return preferred;
  for (const [id, p] of Object.entries(PROVIDERS)) {
    if (p.key()) return id;
  }
  return null;
}

async function callLLM(provider, quality, systemPrompt, userContent, options = {}) {
  const p = PROVIDERS[provider];
  if (!p || !p.key()) throw new Error(`Provider ${provider} not configured`);

  const model = p.models[quality] || p.models.fast;
  const isVision = options.imageBase64 && options.imageMime;

  if (provider === 'anthropic') {
    const messages = [];
    if (isVision) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: options.imageMime, data: options.imageBase64 } },
          { type: 'text', text: userContent },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userContent });
    }

    const res = await fetch(p.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': p.key(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.content?.[0]?.text || '';
  }

  if (provider === 'openai') {
    const messages = [{ role: 'system', content: systemPrompt }];
    if (isVision) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${options.imageMime};base64,${options.imageBase64}` } },
          { type: 'text', text: userContent },
        ],
      });
    } else {
      messages.push({ role: 'user', content: userContent });
    }

    const res = await fetch(p.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key()}` },
      body: JSON.stringify({ model, max_tokens: 4096, messages }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'google') {
    const url = `${p.urlBase}${model}:generateContent?key=${p.key()}`;
    const parts = [];
    if (isVision) {
      parts.push({ inlineData: { mimeType: options.imageMime, data: options.imageBase64 } });
    }
    parts.push({ text: `${systemPrompt}\n\n${userContent}` });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 4096 } }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// ─── Serve Landing Page ──────────────────────────────────────
app.get('/docs', (req, res) => {
  const landingPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(landingPath)) {
    res.sendFile(landingPath);
  } else {
    res.redirect('/');
  }
});

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║                                              ║');
  console.log('  ║   ◈  FallCube API                            ║');
  console.log('  ║   Sovereign File Storage                     ║');
  console.log('  ║                                              ║');
  console.log(`  ║   → http://localhost:${PORT}                    ║`);
  console.log('  ║                                              ║');
  console.log('  ║   Your files. Your server. Zero cloud.       ║');
  console.log('  ║                                              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Admin key: ${ADMIN_KEY}`);
  console.log(`  Storage:   ${STORAGE_DIR}`);
  console.log(`  Files:     ${fileIndex.size}`);
  console.log(`  Max size:  ${MAX_FILE_SIZE}MB per file`);
  console.log(`  Rate limit: ${RATE_LIMIT} req/min`);
  console.log('');

  const providers = Object.entries(PROVIDERS).filter(([, p]) => p.key()).map(([id]) => id);
  if (providers.length) {
    console.log(`  AI: ${providers.join(', ')}`);
  } else {
    console.log('  AI: No providers configured (set ANTHROPIC_API_KEY for file analysis)');
  }
  console.log('');
});

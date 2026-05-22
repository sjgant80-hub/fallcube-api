<p align="center">
  <strong>FallCube API</strong><br>
  <em>Sovereign File Storage</em>
</p>

<p align="center">
  <strong>Your files. Your server. Zero cloud.</strong>
</p>

<p align="center">
  <a href="https://sjgant80-hub.github.io/fallcube-api/">Landing Page</a> &middot;
  <a href="https://github.com/sjgant80-hub/fallcube-api">GitHub</a> &middot;
  <a href="https://sjgant80-hub.github.io/trilogy-framework/">Trilogy Framework</a>
</p>

---

Upload, search, tag, organize, stream, and AI-analyze any file. Self-hosted on your own hardware with zero cloud dependency. FallCube is the storage spine for the Trilogy pipeline.

## Features

- **File Upload** -- SHA-256 hashing with 2-level hash directory storage for scalable, collision-safe organization
- **Full-Text Search** -- Relevance-scored search across filenames, extensions, tags, and folders
- **AI Analysis** -- Analyze documents, images, and code with Anthropic (Claude), OpenAI (GPT), or Google (Gemini)
- **Range Request Streaming** -- HTTP range support for native video/audio streaming in the browser
- **Batch Operations** -- Upload up to 20 files or bulk-delete in a single request
- **File Organization** -- Folders, tags, starring, renaming, moving, and duplicating
- **Storage Analytics** -- Category breakdowns, extension distribution, upload trends, and storage metrics
- **Auto-Categorization** -- Files are automatically classified into `document`, `image`, `code`, `media`, `archive`, `data`, or `other`
- **API Key Management** -- Admin-controlled key generation with role-based access
- **Rate Limiting** -- Built-in per-key rate limiting (configurable, default 120 req/min)

## Quick Start

```bash
# Clone
git clone https://github.com/sjgant80-hub/fallcube-api.git
cd fallcube-api

# Install
npm install

# Run
npm start
```

The server starts on **port 3004**. Your admin key is printed to the console on first launch.

```
  ╔══════════════════════════════════════════════╗
  ║   FallCube API                               ║
  ║   Sovereign File Storage                     ║
  ║   -> http://localhost:3004                    ║
  ║   Your files. Your server. Zero cloud.       ║
  ╚══════════════════════════════════════════════╝

  Admin key: fc_admin_...
```

For development with auto-reload:

```bash
npm run dev
```

**Requirements:** Node.js >= 18

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3004` |
| `MAX_FILE_SIZE_MB` | Maximum upload size in MB | `100` |
| `RATE_LIMIT_PER_MINUTE` | Requests per minute per key | `120` |
| `ADMIN_KEY` | Admin API key (auto-generated if not set) | random |
| `STORAGE_DIR` | File storage directory | `.storage/` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude analysis | -- |
| `OPENAI_API_KEY` | OpenAI API key for GPT analysis | -- |
| `GOOGLE_API_KEY` | Google API key for Gemini analysis | -- |

Set at least one AI provider key to enable the `/files/:id/analyze` endpoint.

## API Endpoints

All endpoints (except `/health` and `/`) require the `x-api-key` header.

### Files

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/upload` | Upload a single file (multipart, field: `file`) |
| `POST` | `/upload/batch` | Upload up to 20 files (multipart, field: `files`) |
| `GET` | `/files` | List and filter files |
| `GET` | `/search?q=` | Full-text search with relevance scoring |
| `GET` | `/files/:id` | Get file metadata |
| `GET` | `/files/:id/download` | Download file with `Content-Disposition: attachment` |
| `GET` | `/files/:id/stream` | Inline streaming with HTTP range request support |
| `PATCH` | `/files/:id` | Update name, starred, tags, or folder |
| `DELETE` | `/files/:id` | Delete a single file |
| `POST` | `/files/delete-batch` | Bulk delete (body: `{ "ids": [...] }`) |
| `POST` | `/files/:id/duplicate` | Duplicate a file |
| `POST` | `/files/:id/analyze` | AI analysis (requires a configured provider) |
| `POST` | `/files/move` | Move files to a folder (body: `{ "ids": [...], "folder": "..." }`) |

### Organization

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/folders` | List all folders with file counts and sizes |
| `POST` | `/folders` | Create a folder |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Storage analytics and category breakdown |
| `GET` | `/` | Health check and service info |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/keys` | Generate a new API key (admin only) |
| `GET` | `/admin/keys` | List all API keys (admin only) |
| `DELETE` | `/admin/keys/:id` | Revoke an API key (admin only) |

### Query Parameters for `GET /files`

| Parameter | Example | Description |
|---|---|---|
| `category` | `document` | Filter by auto-category |
| `ext` | `pdf` | Filter by file extension |
| `folder` | `receipts/2026` | Filter by folder |
| `starred` | `true` | Only starred files |
| `tag` | `finance` | Filter by tag |
| `sort` | `name`, `bytes`, `createdAt`, `ext` | Sort field |
| `order` | `asc` or `desc` | Sort direction (default: `desc`) |
| `limit` | `50` | Results per page (max 500) |
| `offset` | `100` | Pagination offset |

## Code Examples

### Upload a file

```js
const form = new FormData();
form.append('file', fileBuffer, 'receipt.pdf');
form.append('tags', 'finance,q2,receipt');
form.append('folder', 'receipts/2026');

const res = await fetch('http://localhost:3004/upload', {
  method: 'POST',
  headers: { 'x-api-key': YOUR_API_KEY },
  body: form
});

const { file } = await res.json();
// file.id, file.name, file.hash, file.category, file.size
```

### Search files

```js
const res = await fetch('http://localhost:3004/search?q=receipt', {
  headers: { 'x-api-key': YOUR_API_KEY }
});

const { results, total } = await res.json();
```

### AI analysis

```js
const res = await fetch('http://localhost:3004/files/FILE_ID/analyze', {
  method: 'POST',
  headers: {
    'x-api-key': YOUR_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    quality: 'best',         // "fast" or "best"
    provider: 'anthropic',   // "anthropic", "openai", or "google"
    prompt: 'Extract all line items and totals'
  })
});

const { analysis } = await res.json();
// analysis.summary, analysis.entities, analysis.structure,
// analysis.insights, analysis.tags, analysis.actions
```

### cURL -- upload

```bash
curl -X POST http://localhost:3004/upload \
  -H "x-api-key: YOUR_API_KEY" \
  -F "file=@document.pdf" \
  -F "tags=legal,contract" \
  -F "folder=contracts"
```

## File Categories

Files are automatically categorized by extension on upload.

| Category | Extensions |
|---|---|
| `document` | pdf, doc, docx, txt, md, rtf, odt, pptx, xlsx, csv, xls |
| `image` | png, jpg, jpeg, gif, svg, webp, bmp, ico, tiff |
| `code` | js, ts, py, html, css, json, sh, rb, go, java, cpp, c, rs, toml, yaml, yml, xml, sql |
| `media` | mp4, mov, avi, mkv, mp3, wav, m4a, ogg, flac, webm |
| `archive` | zip, tar, gz, rar, 7z, bz2 |
| `data` | json, csv, xml, parquet, sqlite, db |

## Pricing Tiers

| Tier | Storage | Requests/month | Price |
|---|---|---|---|
| **Free** | 100 MB | 100 | $0 |
| **Pro** | 10 GB | 10,000 | Contact |
| **Business** | 100 GB | Unlimited | Contact |

All tiers include full API access, all endpoints, and AI analysis (bring your own provider keys).

## Pipeline Position

FallCube is the storage spine in the Trilogy pipeline. It sits between every stage, persisting and indexing artifacts at each step.

```
DocMind --> FallCube --> Deep --> FallCube --> Flux
 (parse)    (store)   (research)  (store)   (generate)
```

1. **DocMind** parses a document (receipt, contract, report)
2. **FallCube** stores the parsed output with metadata, tags, and hash
3. **Deep** researches or analyzes the stored content
4. **FallCube** stores the research findings
5. **Flux** generates a final deliverable (report, summary, brief)

Every artifact is stored, searchable, and sovereign at every stage.

## Deployment

### Railway / Render / Fly.io

FallCube runs as a standard Node.js service. Set your environment variables in the platform dashboard and deploy.

```bash
# Procfile (included)
web: node server.js
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3004
CMD ["node", "server.js"]
```

### Persistent storage

FallCube writes files to the `.storage/` directory by default. On ephemeral platforms, mount a persistent volume at `STORAGE_DIR`:

```bash
STORAGE_DIR=/mnt/data/fallcube
```

## Dependencies

| Package | Purpose |
|---|---|
| express | HTTP server and routing |
| cors | Cross-origin resource sharing |
| multer | Multipart file upload handling |
| rate-limiter-flexible | Per-key request rate limiting |
| uuid | Unique file ID generation |

Zero external database. Zero cloud SDK. Metadata is stored as JSON on disk.

## Ecosystem

FallCube is part of the **Trilogy** ecosystem.

| Project | Role | Link |
|---|---|---|
| **DocMind** | Document parsing and extraction | [docmind-api](https://sjgant80-hub.github.io/docmind-api/) |
| **Deep** | Research and intelligence | [deep-api](https://sjgant80-hub.github.io/deep-api/) |
| **Flux** | Content generation and output | [flux-api](https://sjgant80-hub.github.io/flux-api/) |
| **Trilogy SDK** | Unified client library | [trilogy-sdk](https://sjgant80-hub.github.io/trilogy-sdk/) |
| **Trilogy Framework** | Pipeline orchestration | [trilogy-framework](https://sjgant80-hub.github.io/trilogy-framework/) |
| **Trilogy Forge** | Project scaffolding | [trilogy-forge](https://sjgant80-hub.github.io/trilogy-forge/) |
| **FallMesh** | Distributed mesh layer | [fallmesh](https://sjgant80-hub.github.io/fallmesh/) |

---

<p align="center">
  <sub>Powered by Konomi Architecture</sub><br>
  <sub>Member of the <a href="https://aicraftspeopleguild.github.io/">AI Craftspeople Guild</a></sub>
</p>

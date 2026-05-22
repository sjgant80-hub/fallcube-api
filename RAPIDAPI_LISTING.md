# FallCube API — RapidAPI Listing

## Short Description (140 chars)

Sovereign file storage API with upload, search, AI analysis, and streaming. Your files, your server, zero cloud dependency.

## Long Description

FallCube is a sovereign file storage API built for developers who want full control over their files. Upload any file type, organize with folders and tags, search across your entire library, stream media with range request support, and analyze documents and images with built-in AI.

Unlike cloud storage APIs that lock you into a vendor, FallCube runs on your infrastructure. Every file stays on your server. Every byte is under your control.

### What you can do

- **Upload** single files or batch up to 20 at once with automatic categorization
- **Organize** with folders, tags, and starred files
- **Search** full-text across file names, tags, folders, and extensions with relevance ranking
- **Stream** media files with HTTP Range request support for video/audio playback
- **Analyze** documents, images, and code with AI (Claude, GPT, or Gemini)
- **Download** files directly or stream inline
- **Track** storage analytics with category breakdowns and upload history

### File intelligence

Files are automatically categorized into documents, images, code, media, archives, and data. SHA-256 hashes are computed on upload for integrity verification. AI analysis extracts summaries, key entities, structural insights, and suggested tags.

### Built for developers

Clean REST API with JSON responses. Multipart upload support. Pagination on all list endpoints. Rate limiting built in. OpenAPI 3.0 spec included.

## Category

Storage > File Management

## Code Examples

### Python — Upload a file

```python
import requests

url = "https://fallcube-api.p.rapidapi.com/upload"

headers = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com"
}

files = {
    "file": ("report.pdf", open("report.pdf", "rb"), "application/pdf")
}

data = {
    "tags": "quarterly,finance",
    "folder": "reports/2026"
}

response = requests.post(url, headers=headers, files=files, data=data)
print(response.json())
```

### Python — Search files

```python
import requests

url = "https://fallcube-api.p.rapidapi.com/search"

headers = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com"
}

params = {"q": "quarterly report"}

response = requests.get(url, headers=headers, params=params)
print(response.json())
```

### Python — AI analysis

```python
import requests

url = "https://fallcube-api.p.rapidapi.com/files/{file_id}/analyze"

headers = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com",
    "Content-Type": "application/json"
}

payload = {
    "quality": "best",
    "prompt": "Extract all financial figures and key dates"
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

### JavaScript — Upload a file

```javascript
const form = new FormData();
form.append("file", fs.createReadStream("report.pdf"));
form.append("tags", "quarterly,finance");
form.append("folder", "reports/2026");

const response = await fetch("https://fallcube-api.p.rapidapi.com/upload", {
  method: "POST",
  headers: {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com"
  },
  body: form
});

const data = await response.json();
console.log(data);
```

### JavaScript — Search files

```javascript
const response = await fetch(
  "https://fallcube-api.p.rapidapi.com/search?q=quarterly%20report",
  {
    headers: {
      "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
      "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com"
    }
  }
);

const data = await response.json();
console.log(data.results);
```

### JavaScript — AI analysis

```javascript
const response = await fetch(
  `https://fallcube-api.p.rapidapi.com/files/${fileId}/analyze`,
  {
    method: "POST",
    headers: {
      "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
      "X-RapidAPI-Host": "fallcube-api.p.rapidapi.com",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      quality: "best",
      prompt: "Extract all financial figures and key dates"
    })
  }
);

const data = await response.json();
console.log(data.analysis);
```

### cURL — Upload a file

```bash
curl -X POST "https://fallcube-api.p.rapidapi.com/upload" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: fallcube-api.p.rapidapi.com" \
  -F "file=@report.pdf" \
  -F "tags=quarterly,finance" \
  -F "folder=reports/2026"
```

### cURL — Search files

```bash
curl -G "https://fallcube-api.p.rapidapi.com/search" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: fallcube-api.p.rapidapi.com" \
  --data-urlencode "q=quarterly report"
```

### cURL — AI analysis

```bash
curl -X POST "https://fallcube-api.p.rapidapi.com/files/{file_id}/analyze" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: fallcube-api.p.rapidapi.com" \
  -H "Content-Type: application/json" \
  -d '{"quality": "best", "prompt": "Extract all financial figures and key dates"}'
```

## Pricing Table

| Feature              | BASIC (Free)      | PRO ($29/mo)       | ULTRA ($99/mo)      | MEGA (Custom)      |
|----------------------|-------------------|--------------------|---------------------|---------------------|
| Requests / month     | 100               | 10,000             | Unlimited           | Unlimited           |
| Requests / day       | 100               | 10,000             | Unlimited           | Unlimited           |
| Requests / minute    | 10                | 60                 | 300                 | 300                 |
| Storage              | 100 MB            | 10 GB              | 100 GB              | Unlimited           |
| File upload          | Yes               | Yes                | Yes                 | Yes                 |
| Batch upload (20)    | Yes               | Yes                | Yes                 | Yes                 |
| Search               | Yes               | Yes                | Yes                 | Yes                 |
| AI file analysis     | Yes               | Yes                | Yes                 | Yes                 |
| Media streaming      | Yes               | Yes                | Yes                 | Yes                 |
| Priority support     | --                | --                 | Yes                 | Yes                 |

## Keywords

- file storage API
- file upload API
- document storage
- AI file analysis
- file management API
- media streaming API
- sovereign file storage
- batch file upload
- file search API
- document analysis API

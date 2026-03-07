# AP Gov Essay Grader (Ollama Cloud)

Grade AP U.S. Government essays using Ollama Cloud. The grader uses a 6-point College Board–aligned rubric and returns feedback per criterion.

## Fixing "Failed to fetch"

Browsers block direct requests from your page to `ollama.com` (CORS). Use the **proxy server** so the page and API share the same origin.

### 1. Run the proxy server

From this folder, use **either**:

**Option A — Python (no install if you have Python):**
```bash
python server.py
```

**Option B — Node.js:**  
Install Node from [nodejs.org](https://nodejs.org/), then:
```bash
node server.js
```

Default port is 3000. Set `PORT` (e.g. `set PORT=8080` on Windows) to use another.

### 2. Open the app from that server

In your browser go to:

**http://localhost:3000/**

Do **not** open `ap-gov-grader.html` directly (e.g. from File Explorer). Always use the URL the server prints.

### 3. Set your API key and grade

1. Get an API key at [ollama.com/settings/keys](https://ollama.com/settings/keys).
2. Enter it in the header, click **Save**.
3. Choose essay type, prompt, and model; write or paste your essay; click **Grade Essay**.

## Deploying as a website

Deploy the proxy and HTML together so they stay on the same origin. **→ Step-by-step for Render: see [RENDER.md](RENDER.md).**

- **Render:** Connect your GitHub repo, choose Python or Node, set the start command (`python server.py` or `node server.js`). Render sets `PORT` automatically.
- **Python:** No extra packages; uses only the standard library.
- **Node:** Uses built-ins only; `npm start` runs `node server.js`.

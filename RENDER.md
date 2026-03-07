# Deploy AP Gov Essay Grader to Render

Follow these steps to host the app on Render so you can use it from any device and any network.

---

## 1. Put your code on GitHub

Render deploys from a Git repository. If the project isn’t in GitHub yet:

**Don’t have Git installed?** → Use the browser method: **[UPLOAD-TO-GITHUB.md](UPLOAD-TO-GITHUB.md)** (create repo on GitHub, then upload your folder’s files).

**Using Git:** Create a repo at [github.com/new](https://github.com/new), then in your project folder run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```
   Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repo name.

---

## 2. Sign in to Render

1. Go to [render.com](https://render.com) and sign up or log in (e.g. with GitHub).
2. From the dashboard, click **New +** → **Web Service**.

---

## 3. Connect the repository

1. Under **Connect a repository**, find your repo (e.g. `OLMAautograde`) and click **Connect**.
2. If you don’t see it, click **Configure account** and grant Render access to the right GitHub account or repo.

---

## 4. Configure the Web Service

Use these settings (you can choose **Python** or **Node**).

### Option A — Python

| Field | Value |
|--------|--------|
| **Name** | `ap-gov-grader` (or any name you like) |
| **Region** | Choose the one closest to you |
| **Root Directory** | Leave blank |
| **Runtime** | **Python 3** |
| **Build Command** | `pip install -r requirements.txt` (or leave blank) |
| **Start Command** | `python server.py` |

### Option B — Node

| Field | Value |
|--------|--------|
| **Name** | `ap-gov-grader` (or any name you like) |
| **Region** | Choose the one closest to you |
| **Root Directory** | Leave blank |
| **Runtime** | **Node** |
| **Build Command** | Leave blank (or `npm install`) |
| **Start Command** | `npm start` or `node server.js` |

- **Instance type:** Free is enough to start.

Click **Create Web Service**.

---

## 5. Wait for the first deploy

Render will clone the repo, run the build (if any), and start the server. The first deploy can take a couple of minutes. When it’s done, the top of the page will show a URL like:

**https://ap-gov-grader-xxxx.onrender.com**

---

## 6. Use your live app

1. Open that URL in your browser (on any device, any network).
2. Enter your **Ollama Cloud API key** (from [ollama.com/settings/keys](https://ollama.com/settings/keys)), click **Save**.
3. Choose essay type and prompt, write or paste your essay, and click **Grade Essay**.

---

## Notes

- **Free tier:** The service may “spin down” after 15 minutes of no traffic. The first request after that can take 30–60 seconds to wake up; then it’s fast again.
- **API key:** The key is stored only in your browser (on each device). Render never sees or stores it; the server only forwards it to Ollama Cloud when you grade.
- **Updates:** Push changes to the same branch (e.g. `main`); Render will redeploy automatically if auto-deploy is on (default).

You’re done. You can use the Render URL from any network and any device.

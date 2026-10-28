# AI StudyMate

An AI-powered study assistant for university students.
Helps with note summarization, practice quizzes, concept explanations, and weekly scheduling.

> **AI backend: [Groq](https://groq.com)** — uses `llama-3.3-70b-versatile` via the Groq Chat Completions API.
> A free Groq API key is available at **[console.groq.com/keys](https://console.groq.com/keys)** — no billing required.

---

## Quick start — no install required

The project is a **plain HTML/CSS/JS application**.  
There is no build step, no npm, and no server needed for basic use.

### Option A — Open directly in a browser (simplest)

1. Find the project folder on your computer (`ai-studymate/`).
2. Double-click `index.html`.  
   The landing page opens in your default browser.
3. Click **Open App** to go to the dashboard.

> **Note:** Opening files with `file://` is enough for all Demo Mode features.  
> Live AI (real OpenAI calls) will be blocked by CORS on most browsers when using
> `file://`. Use Option B or C if you need live AI.

---

### Option B — Serve locally with Python (recommended for live AI)

If you have Python installed (any modern version):

```bash
# From inside the ai-studymate/ folder:
python -m http.server 5500
```

Then open `http://localhost:5500` in your browser.

---

### Option C — Serve with Node.js / npx

```bash
# From inside the ai-studymate/ folder:
npx serve .
```

Then open the URL shown in your terminal (usually `http://localhost:3000`).

---

### Option D — VS Code Live Server

1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. The page opens at `http://127.0.0.1:5500/` automatically.

---

## Demo Mode (no API key needed)

**All four AI features work without an API key.**  
When no key is configured, the app runs in **Demo Mode**:

| Feature | Demo behaviour |
|---------|---------------|
| Note Summarizer | Returns a rich topic-aware summary (biology, chemistry, history, economics, maths, CS, physics) |
| Practice Quiz | Returns 5 real multiple-choice questions matched to the topic |
| Concept Explainer | Returns a structured explanation with analogy for common academic concepts |
| Study Scheduler | Generates a realistic day-by-day study plan |

Demo responses are clearly labelled:
- The status banner at the top of every page shows **🎓 Demo Mode**
- The result box has an **amber left border**
- The footer metadata shows **🎓 Demo**

---

## Enabling Live AI (Groq API key)

1. Go to **[console.groq.com/keys](https://console.groq.com/keys)** and create a free account.
2. Click **Create API Key** and copy the key (starts with `gsk_`).
3. In the app, click **⚙ Settings** in the top navigation bar.
4. Paste the key into **Groq API Key** → click **Save**.

The banner turns green (**✅ Live AI active**) and all four tools use the real Groq API.

> Your key is stored in `localStorage` in your browser only.
> It is sent only to `api.groq.com` — never to any third-party server.
> No key is hardcoded anywhere in the source code.

---

## What happens when a live API call fails

The app handles all Groq errors gracefully — **it never crashes or shows a blank screen**:

| Error | What you see |
|-------|-------------|
| Invalid key (401) | Red toast: "Invalid Groq API key. Check that you copied the full key (starts with gsk_)…" |
| Rate limit (429) | Red toast: "Groq rate limit reached. Wait 10–30 seconds and try again." |
| Model not found | Red toast: "The model llama-3.3-70b-versatile was not found on Groq…" |
| Quota exceeded | Red toast: "Groq API quota exceeded. Check your usage at console.groq.com." |
| Network / CORS | Red toast: "Could not reach api.groq.com. Use a local server if opening via file://." |

In all cases, **rich demo content is shown automatically** below the error toast so you can continue working.

---

## Taking screenshots for your submission

### Recommended pages to screenshot

| Page | URL path | What to show |
|------|----------|-------------|
| Landing | `index.html` | Hero section + feature cards |
| Dashboard | `dashboard.html` | Stats + recent activity |
| Summarizer (demo) | `pages/summarizer.html` | Notes input + amber-bordered demo summary |
| Quiz (demo) | `pages/quiz.html` | Generated quiz questions |
| Quiz result | `pages/quiz.html` | Score screen after submitting |
| Explainer (demo) | `pages/explainer.html` | Concept explanation output |
| Scheduler (manual) | `pages/scheduler.html` | Filled weekly schedule grid |
| Scheduler (AI plan) | `pages/scheduler.html` → AI Plan tab | Generated plan output |

### Capturing screenshots

**Windows:**
- `Win + Shift + S` — select any region, auto-copies to clipboard
- `Win + PrtScn` — saves to `Pictures/Screenshots/`

**macOS:**
- `Cmd + Shift + 4` — drag to select a region
- `Cmd + Shift + 3` — full screen

**In-browser (DevTools):**
1. Open DevTools (`F12`)
2. `Ctrl+Shift+P` (Windows) or `Cmd+Shift+P` (Mac)
3. Type `screenshot` → choose **Capture full size screenshot**  
   This captures the entire page, even parts below the fold.

### Demo walkthrough for submission

Suggested order to demonstrate all features in under 5 minutes:

1. Open `index.html` — show the landing page
2. Click **Open App** → show Dashboard (stats start at 0)
3. Go to **Note Summarizer** → paste any text (e.g. "Photosynthesis converts light…") → click Summarize
4. Go to **Practice Quiz** → type "Biology" → Generate → answer questions → Submit
5. Go to **Concept Explainer** → click **Photosynthesis** suggestion → Explain
6. Go to **Study Scheduler** → add 2–3 manual tasks → switch to AI Plan tab → generate a plan for "Biology"
7. Return to Dashboard — stats now show your activity

---

## Project structure

```
ai-studymate/
├── index.html              Landing page
├── dashboard.html          Main hub (stats + activity feed)
├── pages/
│   ├── summarizer.html     Note Summarizer
│   ├── quiz.html           Practice Quiz
│   ├── explainer.html      Concept Explainer
│   └── scheduler.html      Study Scheduler + AI Plan
├── css/
│   ├── styles.css          Base layout, navigation, responsive
│   └── components.css      Buttons, cards, forms, result boxes
└── js/
    ├── storage.js          LocalStorage CRUD (no external dependencies)
    ├── ai.js               AI integration layer + rich demo content
    └── app.js              Shared UI logic (nav, tabs, settings modal)
```

---

## Known limitations (honest)

| Limitation | Detail |
|-----------|--------|
| Demo responses are pre-written | They cover 7 subject areas. Topics outside that set get a generic (but still structured) demo response. |
| No real-time AI in Demo Mode | Responses do not adapt to the specific wording of your input — they are matched by keyword detection. |
| Live AI requires billing | OpenAI's free tier has very limited credits. A paid key is needed for sustained use. |
| CORS on `file://` | Live API calls will be blocked when opening HTML files directly from disk (not via a local server). Demo Mode works fine. |
| No user accounts | All data (history, schedule, API key) is stored in `localStorage` — it is per-browser and not synced. |
| No mobile keyboard shortcut | The hamburger menu requires JavaScript; it will not work if JS is disabled. |

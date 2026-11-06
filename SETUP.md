# Sift — setup guide

Ramble your thoughts → Sift splits them into **tasks** and **ideas**, finds free time on your
Google Calendar, and your phone reminds you through the Google Calendar app.

You need three things, in this order: put the app online → Claude key → Google Calendar.
It takes about 20 minutes.

---

## 1. Put it online (so your phone can open it)

Android needs an `https://` address to use the microphone and install the app.

1. In this folder, build it:
   ```bash
   npm run build
   ```
   That creates a `dist` folder.
2. Go to **https://app.netlify.com/drop** and sign up (free).
3. Drag the **`dist`** folder onto the page. You get a URL like `https://something-123.netlify.app`.
   Rename it under *Site configuration → Change site name*, e.g. `sift-yourname.netlify.app`.
4. **Write that URL down.** You need it for Google in step 3.

Every time you change the app later: `npm run build`, then drag `dist` onto *Deploys* in Netlify.

## 2. Claude API key (the "brain")

1. Go to **https://console.anthropic.com** and sign up.
2. **Billing** → add credits ($5 lasts a long time; each brain dump costs roughly 2–5 cents).
3. Optional but smart: **Limits** → set a monthly spend limit, e.g. $10.
4. **Settings → API Keys → Create Key**. Copy it (starts with `sk-ant-`).
5. Paste it **only into Sift's Settings on your phone**. Don't paste it in chats, code or screenshots.

The key stays in your phone's browser storage. It is never in the website itself, so sharing the
URL on LinkedIn is safe: other people just get demo mode.

## 3. Google Calendar

1. Go to **https://console.cloud.google.com** → top bar project picker → **New project** → name it `Sift`.
2. Search **"Google Calendar API"** → **Enable**.
3. Left menu **Google Auth Platform** (or *APIs & Services → OAuth consent screen*) → **Get started**:
   - App name `Sift`, your email as support email → **External** → finish.
   - **Audience → Test users → Add users** → add your own Gmail.
4. **Clients → Create client**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: add your Netlify URL (`https://sift-yourname.netlify.app`)
     and `http://localhost:5173` (for testing on your PC).
   - Create → copy the **Client ID** (ends with `.apps.googleusercontent.com`).
5. In Sift → Settings → paste the Client ID → **Connect Google Calendar** → pick your account.
   Google will say the app is unverified: that's expected for your own app. Tap *Continue*.

Google's sign-in lasts about an hour. When it expires, Sift tells you; tap **Connect** again.

## 4. Install on your Android phone

1. Open your Netlify URL in **Chrome**.
2. ⋮ menu → **Add to Home screen** → **Install**.
3. Open Sift from the home screen, allow the microphone, paste your key and Client ID in Settings.
4. In the **Google Calendar** app, make sure notifications are on. That's what reminds you.

---

## Running it on your PC

```bash
npm install
npm run dev
```
Then open http://localhost:5173.

## How it's built (for vibe coding later)

| File | What it does |
|---|---|
| `src/lib/ai.ts` | The prompt and Claude call that sorts your brain dump. Tweak the prompt here. |
| `src/lib/scheduler.ts` | Finds free slots (morning/afternoon/evening, your waking hours, around events). |
| `src/lib/calendar.ts` | Google sign-in, reading your events, creating events with reminders. |
| `src/lib/speech.ts` | Voice-to-text (Chrome's built-in speech recognition). |
| `src/components/` | Screens: capture orb, review sheet, plan, ideas, settings. |
| `src/index.css` | All the styling. Colors are at the top. |

# Sift — setup guide

Ramble your thoughts → Sift splits them into **tasks** and **ideas**, finds free time on your
Google Calendar, and your phone reminds you through the Google Calendar app.

You need three things: the app online (done) → a free Gemini key → Google Calendar.

**Live app:** https://atharvatilwankar007.github.io/Sift/

---

## 1. Online (already done)

The code lives at https://github.com/atharvatilwankar007/Sift. Every push to `main` rebuilds and
redeploys the site automatically through GitHub Actions (`.github/workflows/deploy.yml`) in about
30 seconds. Check progress under the repo's **Actions** tab.

## 2. Gemini API key (the "brain", free)

1. Go to **https://aistudio.google.com/apikey** and sign in with your Google account.
2. Click **Create API key** and copy it (starts with `AIza`).
3. Paste it **only into Sift's Settings on your phone**. Don't paste it in chats, code or screenshots.

The free tier has daily limits that are plenty for personal use. On the free tier Google may use
what you send to improve its products, so keep that in mind for sensitive details.
A Claude key (`sk-ant-…` from console.anthropic.com) also works in the same field if you ever switch.

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
   - **Authorized JavaScript origins**: add `https://atharvatilwankar007.github.io`
     and `http://localhost:5173` (for testing on your PC).
   - Create → copy the **Client ID** (ends with `.apps.googleusercontent.com`).
5. In Sift → Settings → paste the Client ID → **Connect Google Calendar** → pick your account.
   Google will say the app is unverified: that's expected for your own app. Tap *Continue*.

Google's sign-in lasts about an hour. When it expires, Sift tells you; tap **Connect** again.

## 4. Install on your Android phone

1. Open https://atharvatilwankar007.github.io/Sift/ in **Chrome**.
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

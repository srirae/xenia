<div align="center">

# Xyris Vision

### Share the moment. Not your identity.

**Every photo carries hidden GPS, device, and timestamp data — plus visible clues in the image itself. Xyris finds what leaks, shows you exactly what’s at risk, and strips it out before you post.**

<br>

[![Live Demo](screenshots/ss1.1.png)](https://xyrisvision.vercel.app)

<br>

</div>

---

## The problem

A single photo can expose **where you live**, **what device you use**, and **when you were there** — through invisible EXIF metadata *and* visible content like street signs, license plates, reflections, and landmarks. Most “privacy tools” quietly upload your images to a server. **Xyris doesn’t.**

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### Aegis — free forever
- Unlimited **on-device** metadata removal
- GPS, camera model, timestamps & software tags
- Live leak report with severity labels
- Download metadata-stripped image
- No account required

</td>
<td width="50%" valign="top">

### Eclipse — pay per scan
- Everything in Aegis
- **AI visual scan** — street signs, plates, faces, landmarks
- Red highlight boxes · click to blur/redact
- Download **fully redacted** images
- Saved scan history
- Claude Opus vision model

</td>
</tr>
</table>

<br>

<table>
<tr>
<td><img src="screenshots/location.png" alt="GPS leak detection" width="100%" /></td>
<td><img src="screenshots/features.png" alt="Feature cards" width="100%" /></td>
</tr>
<tr>
<td align="center"><sub>GPS &amp; location leaks surfaced in plain language</sub></td>
<td align="center"><sub>Every hidden tag explained before you share</sub></td>
</tr>
</table>

<br>

<table>
<tr>
<td><img src="screenshots/privacy.png" alt="Privacy section" width="100%" /></td>
<td><img src="screenshots/pay.png" alt="Pricing tiers" width="100%" /></td>
</tr>
</table>

---

## How it works

```
  Your photo
      │
      ├─► Browser (always)
      │     Read EXIF · strip metadata on canvas · never upload raw file
      │
      └─► Eclipse AI scan (optional)
            Metadata stripped first → base64 to API → findings + bounding boxes
            Click boxes to blur · download redacted copy · history saved
```

| Step | What happens | Where |
|------|--------------|-------|
| 1 | Drop or upload an image | Browser only |
| 2 | EXIF parsed — GPS, device, timestamps shown | Browser only |
| 3 | Canvas re-draw strips hidden metadata | Browser only |
| 4 | AI scans visible risks (signs, plates, faces…) | Render API |
| 5 | Red boxes overlay findings · click to redact | Browser canvas |
| 6 | Download clean or fully redacted image | Browser |

> **Core rule:** images are processed in memory and **never stored**. Metadata is stripped client-side before any pixel data leaves the browser.

---

## Stack

| Layer | Tech | Host |
|-------|------|------|
| Frontend | HTML · DC runtime · Canvas | [Vercel](https://xyrisvision.vercel.app) |
| API | Express · TypeScript · Zod | [Render](https://xenlens-backend.onrender.com) |
| Auth & DB | Supabase · Google OAuth · Postgres | Supabase |
| Vision | OpenRouter · Claude Opus | Server-side only |
| Payments | Stripe Checkout · webhook credits | Stripe |

---

## Run locally

### Frontend
```bash
cd frontend
run index.html
```

### Backend
```bash
cd backend
cp ../.env.example .env   # fill in secrets
npm install
npm run dev                 # → http://localhost:4000
```

Set `frontend/config.js` — local dev auto-targets `http://localhost:4000`; production targets Render.

### Database
Paste `database/schema.sql` into the Supabase SQL editor (profiles, scans, RLS, credit functions).

---

## Deploy

| Service | URL |
|---------|-----|
| **Frontend** | https://xyrisvision.vercel.app |
| **Backend** | https://xenlens-backend.onrender.com |

Full step-by-step guide → [`DEPLOY.md`](DEPLOY.md)

---

## Security

- **No image storage** — bytes live in memory, then are discarded
- **Metadata stripped before any API call** — canvas re-draw in the browser first
- **Secrets server-side only** — API keys never reach the client
- **Stripe webhook signature verified** — idempotent credit provisioning
- **Atomic balance math** — Postgres functions, no race conditions
- **Row-level security** — users only see their own data
- **Rate limited** — 10 scans / minute / user

We never claim “100% secure.” We say: *the sensitive half runs on your device and is never uploaded; the visual scan uses an API that doesn’t train on your image, with metadata already stripped.*

---

## Project structure

```
xenia/
├── frontend/          # Static UI — Vercel
│   ├── index.html     # Scanner, pricing, auth modals
│   ├── support.js     # DC component runtime
│   └── config.js      # apiUrl + Supabase anon key
├── backend/           # Express API — Render
│   └── src/
│       ├── routes/    # analyze · user · stripe
│       ├── services/  # vision · stripe
│       └── middleware/# auth · rate-limit · errors
├── database/
│   └── schema.sql     # Supabase schema + RLS
├── screenshots/       # README assets
└── DEPLOY.md
```

---

## Hackathon

Built for **NJx June 2026** · Privacy arc · Mission **1.3 — Burn After Reading**

---

<div align="center">

**Built with care for people who share photos — not their location.**

<br>

[Live demo](https://xyrisvision.vercel.app) · [Report an issue](https://github.com/srirae/xenia/issues) · Support: aegiswheil@gmail.com

</div>

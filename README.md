# TownSpot Raycast Extension

A Raycast command for natural-language event discovery in your Town.

## Setup

1. Install dependencies

```bash
npm install
```

2. Start in development mode from the extension root

```bash
npm run dev
```

If your Raycast CLI binary is not on PATH, `npm run dev` uses the local `ray` CLI bundled in the extension dependency.

## Local API

Use this in command preferences:
- API Base URL: `http://localhost:3000/api`
- Locale: `en-GB`

If you see `fetch failed`, check:
- Server is running: `curl http://localhost:3000/api/raycast/query` returns JSON when using a valid POST body.
- Preference URL includes protocol (`http://` or `https://`).
- You are not using `https://localhost:3000` without a local cert (use `http://localhost:3000`).

## Command

- **Ask TownSpot** (`ask`)
  - Ask a free-text question.
  - Set your town slug (for example `kentish-town`).
  - Configure the backend URL and locale in command preferences.

## Endpoint Contract

POST to `/api/raycast/query` with:

```json
{
  "query": "what's on this weekend in kentish-town",
  "townSlug": "kentish-town",
  "locale": "en-GB",
  "limit": 8,
  "conversation": []
}
```

Response:

```json
{
  "answer": "I found 3 events in Kentish Town this weekend.",
  "events": [
    {
      "id": "...",
      "title": "...",
      "startTime": "...",
      "endTime": "...",
      "venueName": "...",
      "startLabel": "Mon 12 MAR · 20:00",
      "tags": ["Music"],
      "url": "https://townspot.co/event/..."
    }
  ],
  "town": { "name": "Kentish Town", "slug": "kentish-town", "timezone": "Europe/London" },
  "suggestions": ["..."]
}
```

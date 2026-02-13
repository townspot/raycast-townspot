# TownSpot Raycast Extension

Arrow-key-first event discovery in Raycast with grounded results from TownSpot.

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
  - Opens with today's listings by default.
  - Type naturally in the search bar (`today`, `this weekend`, `kids and family`).
  - Use up/down arrows to browse event results.
  - Use the top `Category` filter row to quickly toggle categories (including kids/family).
  - Pick your town from the dropdown selector (`Auto (Near Me)` + visible active towns).
  - Run quick presets (Tonight, Weekend, Kids and Family, Free, Live Music).
  - Events are grouped by day sections (Today, Tomorrow, etc.) with time shown on the right.
  - Press Enter to open a native Raycast event detail page. Website open is a separate action.
  - Town context resolution order:
    1. selected town from dropdown
    2. `Auto (Near Me)` via IP detection + `/api/places/match-zone`
    3. fallback: `kentish-town`

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

## UX Behavior

- Results list is verified-events-first.
- Summary shown in the command is generated from returned events, not free-form AI text.
- Follow-up prompts can be selected with arrow keys and Enter to re-run quickly.

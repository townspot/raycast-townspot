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

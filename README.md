# Streeka

Streeka is a starter Next.js (TypeScript) application that uses the `app/` directory.

Streeka helps you track recurring tasks and streaks by defining schedules, marking completions, and calculating how long you have stayed consistent with habits. It is designed as a lightweight foundation you can extend with your own task data, streak logic, and UI to visualize progress over time.

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm (bundled with Node.js)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

```bash
npm run build
```

`next build` should succeed locally; this is documented here but not executed in this environment.

## Testing and Quality Checks

```bash
npm run test
npm run format:check
npm run lint
```

## Deployment

### Vercel (recommended)

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the project in Vercel.
3. Use the default Next.js build settings.

### Optional SPA routing (static export)

If you export the site as a static SPA and need client-side routing fallbacks on Vercel, add a
`vercel.json` file with a rewrite to `index.html`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Only add this when you are deploying a static export that relies on client-side routing.

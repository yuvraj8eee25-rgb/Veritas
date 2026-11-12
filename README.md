# Veritas

Veritas is a debate practice platform. The current app is in [`veritas-react/`](veritas-react/), and the original Vite app and shared code are in [`app/`](app/). Keep both directories in the checkout: the Next.js app imports shared code from `app/`.

## Run the current app

Use Node.js 22. From the repository root:

```sh
cd veritas-react
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. Then run:

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See the [Next.js app guide](veritas-react/README.md) for feature and backend details, or the [original app guide](app/README.md) for the Vite setup.

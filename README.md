# Veritas

Veritas is a debate practice platform with guided research, quote practice, Study, Debate AI, live debate, and Classroom. The React and Next.js app is in [veritas-react](veritas-react/). The [app](app/) directory contains shared practice code and the Supabase backend.

## Run locally

Use Node.js 22.18 or newer. From the repository root:

```sh
cd veritas-react
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` using your Supabase project URL and publishable key. Then run:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). For a hosted build, set the project root to `veritas-react` and keep `app/` available to the build for shared imports. Supabase functions and migrations are in [app/supabase](app/supabase/).

[Evidence Lab and quote practice](veritas-react/docs/features/evidence-lab.md)

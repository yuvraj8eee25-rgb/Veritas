export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return Response.json(
    { ok: true, service: "veritas-react", supabaseConfigured },
    { headers: { "Cache-Control": "no-store" } },
  );
}

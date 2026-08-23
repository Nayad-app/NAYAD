import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nayad.store",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("976") && digits.length === 11) return digits.slice(3);
  if (digits.length === 8 && /^[89]/.test(digits)) return digits;
  return "";
}

async function findUserByPhone(admin: ReturnType<typeof createClient>, phone: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((user) => {
      const metadataPhone = normalizePhone(user.user_metadata?.login_phone);
      const authPhone = normalizePhone(user.phone);
      return metadataPhone === phone || authPhone === phone;
    });
    if (match) return match;
    if (users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone);
    const password = String(body?.password ?? "");
    if (!phone || !password) return json({ error: "Invalid login credentials" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
      Deno.env.get("SUPABASE_SECRET_KEY")?.trim() ||
      "";
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
      "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("phone-login: service configuration is missing");
      return json({ error: "Login service unavailable" }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const user = await findUserByPhone(admin, phone);
    if (!user?.id || !user.email) return json({ error: "Invalid login credentials" }, 401);

    // Verify the password before returning the Auth email. This prevents phone
    // enumeration and keeps the browser-side native sign-in as the source of
    // the final session.
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await verifier.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error || !data?.user || String(data.user.id) !== String(user.id)) {
      return json({ error: "Invalid login credentials" }, 401);
    }

    return json({ user_id: user.id, email: user.email });
  } catch (error) {
    console.error("phone-login:", error);
    return json({ error: "Login service unavailable" }, 503);
  }
});

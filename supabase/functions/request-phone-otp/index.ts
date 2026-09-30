import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nayad.store",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const genericResponse = () =>
  new Response(JSON.stringify({ accepted: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) return `+976${digits}`;
  if (/^976\d{8}$/.test(digits)) return `+${digits}`;
  return "";
}

function serviceRoleKey() {
  const direct =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ||
    Deno.env.get("SUPABASE_SECRET_KEY")?.trim();
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return typeof keys?.default === "string" ? keys.default.trim() : "";
  } catch {
    return "";
  }
}

async function hashIdentifier(value: string, pepper: string) {
  const bytes = new TextEncoder().encode(`${pepper}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requestIp(request: Request) {
  return (request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown").trim().slice(0, 128);
}

async function consumeLimit(
  admin: ReturnType<typeof createClient>,
  action: string,
  identifier: string,
  pepper: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number,
) {
  const keyHash = await hashIdentifier(identifier, pepper);
  const { data, error } = await admin.rpc("consume_auth_rate_limit", {
    p_action: action,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return result?.allowed === true;
}

async function findAccountByPhone(admin: ReturnType<typeof createClient>, phone: string) {
  const { data, error } = await admin
    .from("phone_login_accounts")
    .select("user_id")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return genericResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone);
    if (!phone) return genericResponse();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const secret = serviceRoleKey();
    const publishableKey =
      Deno.env.get("SUPABASE_ANON_KEY")?.trim() ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() ||
      "";
    if (!supabaseUrl || !secret || !publishableKey) {
      console.error("request-phone-otp: service configuration is missing");
      return genericResponse();
    }

    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const pepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER")?.trim() || secret;
    const [ipAllowed, phoneAllowed] = await Promise.all([
      consumeLimit(admin, "phone-otp-ip", requestIp(request), pepper, 20, 900, 900),
      consumeLimit(admin, "phone-otp-phone", phone, pepper, 5, 900, 900),
    ]);
    if (!ipAllowed || !phoneAllowed) return genericResponse();

    const account = await findAccountByPhone(admin, phone);
    if (!account?.user_id) return genericResponse();

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(account.user_id);
    if (userError || !userResult?.user?.id) return genericResponse();
    if (normalizePhone(userResult.user.phone) !== phone) {
      const { error: updateError } = await admin.auth.admin.updateUserById(account.user_id, { phone });
      if (updateError) {
        console.error("request-phone-otp: phone sync failed", updateError.message);
        return genericResponse();
      }
    }

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await authClient.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    if (error) console.error("request-phone-otp: OTP send failed", error.message);
  } catch (error) {
    console.error("request-phone-otp:", error);
  }

  // Keep the same public response for found, missing and rate-limited numbers
  // so callers cannot discover whether a phone number is registered.
  return genericResponse();
});

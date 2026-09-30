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

// Keep the previous published client working during its cache transition.
// The new client omits these fields and always continues to onboarding.
const legacyBusinessTypes = new Set([
  "Жижиглэн худалдаа",
  "Бөөний худалдаа",
  "Хоол, хүнс",
  "Үйлчилгээ",
  "Онлайн худалдаа",
  "Бусад",
]);

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("976") && digits.length === 11) return `+976${digits.slice(3)}`;
  if (digits.length === 8) return `+976${digits}`;
  return "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ??
    request.headers.get("cf-connecting-ip") ??
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

async function registrationConflict(admin: ReturnType<typeof createClient>, phone: string, email: string) {
  const [phoneResult, emailResult] = await Promise.all([
    admin.from("phone_login_accounts").select("user_id").eq("phone", phone).limit(1).maybeSingle(),
    admin.from("phone_login_accounts").select("user_id").eq("email", email).limit(1).maybeSingle(),
  ]);
  if (phoneResult.error) throw phoneResult.error;
  if (emailResult.error) throw emailResult.error;
  return Boolean(phoneResult.data || emailResult.data);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const phone = normalizePhone(body?.phone);
    const legacyStoreName = String(body?.store_name ?? "").trim();
    const legacyBusinessType = String(body?.business_type ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    const hasLegacyStoreFields = Boolean(legacyStoreName || legacyBusinessType);

    if (
      !name || name.length > 100 ||
      !phone ||
      (hasLegacyStoreFields && (
        !legacyStoreName || legacyStoreName.length > 80 ||
        !legacyBusinessTypes.has(legacyBusinessType)
      )) ||
      !validEmail(email) ||
      password.length < 6 || password.length > 72
    ) {
      return json({ error: "Invalid registration details", code: "INVALID_INPUT" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const secret = serviceRoleKey();
    if (!supabaseUrl || !secret) {
      console.error("register-user: service configuration is missing");
      return json({ error: "Registration service unavailable", code: "SERVICE_UNAVAILABLE" }, 503);
    }

    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const pepper = Deno.env.get("AUTH_RATE_LIMIT_PEPPER")?.trim() || secret;
    const [ipAllowed, phoneAllowed, emailAllowed] = await Promise.all([
      consumeLimit(admin, "register-ip", requestIp(request), pepper, 10, 3600, 3600),
      consumeLimit(admin, "register-phone", phone, pepper, 3, 3600, 3600),
      consumeLimit(admin, "register-email", email, pepper, 3, 3600, 3600),
    ]);
    if (!ipAllowed || !phoneAllowed || !emailAllowed) {
      return json({ error: "Registration temporarily unavailable", code: "REGISTRATION_UNAVAILABLE" }, 429);
    }

    if (await registrationConflict(admin, phone, email)) {
      return json({ error: "Registration unavailable", code: "REGISTRATION_UNAVAILABLE" }, 409);
    }

    const userMetadata: Record<string, string> = {
      full_name: name,
      login_phone: phone,
    };
    if (hasLegacyStoreFields) {
      userMetadata.store_name = legacyStoreName;
      userMetadata.business_type = legacyBusinessType;
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (error || !data?.user?.id) {
      const message = String(error?.message ?? "").toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ error: "Registration unavailable", code: "REGISTRATION_UNAVAILABLE" }, 409);
      }
      console.error("register-user: create user failed", error?.message ?? "unknown");
      return json({ error: "Registration failed", code: "CREATE_FAILED" }, 400);
    }

    return json({ user_id: data.user.id, created: true }, 201);
  } catch (error) {
    console.error("register-user:", error);
    return json({ error: "Registration service unavailable", code: "SERVICE_UNAVAILABLE" }, 503);
  }
});

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

const allowedBusinessTypes = new Set([
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

async function findConflicts(admin: ReturnType<typeof createClient>, phone: string, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) {
      if (String(user.email ?? "").trim().toLowerCase() === email) return "EMAIL_EXISTS";
      if (normalizePhone(user.user_metadata?.login_phone) === phone || normalizePhone(user.phone) === phone) {
        return "PHONE_EXISTS";
      }
    }
    if (users.length < 1000) break;
  }
  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const phone = normalizePhone(body?.phone);
    const storeName = String(body?.store_name ?? "").trim();
    const businessType = String(body?.business_type ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (
      !name || name.length > 100 ||
      !phone ||
      !storeName || storeName.length > 80 ||
      !allowedBusinessTypes.has(businessType) ||
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

    const conflict = await findConflicts(admin, phone, email);
    if (conflict === "PHONE_EXISTS") {
      return json({ error: "Phone already registered", code: conflict }, 409);
    }
    if (conflict === "EMAIL_EXISTS") {
      return json({ error: "Email already registered", code: conflict }, 409);
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        login_phone: phone,
        store_name: storeName,
        business_type: businessType,
      },
    });

    if (error || !data?.user?.id) {
      const message = String(error?.message ?? "").toLowerCase();
      if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
        return json({ error: "Email already registered", code: "EMAIL_EXISTS" }, 409);
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

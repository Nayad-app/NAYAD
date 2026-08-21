import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nayad.store",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character] ?? character));

async function rpc(url: string, apiKey: string, authorization: string, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "apikey": apiKey,
      "Authorization": authorization,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : "Store invite request failed";
    throw new Error(message);
  }
  return data;
}

function getServiceRoleKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacyKey) return legacyKey;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return typeof keys?.default === "string" ? keys.default.trim() : "";
  } catch {
    return "";
  }
}

async function sendWithAuthSmtp(
  supabaseUrl: string,
  apiKey: string,
  email: string,
  link: string,
) {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) return false;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: isRegistered, error: lookupError } = await admin.rpc("is_auth_email_registered", {
    p_email: email,
  });
  if (lookupError) {
    console.error("send-store-invite: recipient lookup failed", lookupError.message);
    return false;
  }

  // Do not create an Auth account for an unknown recipient. NAYAD's normal
  // registration collects their name, phone and password; bypassing that flow
  // would leave an invited account without a usable password/phone login.
  if (isRegistered !== true) return false;

  const authClient = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: link },
  });
  if (error) {
    console.error("send-store-invite: Auth magic-link delivery failed", error.message);
    return false;
  }
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization")?.trim() ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const apiKey = request.headers.get("apikey")?.trim() || Deno.env.get("SUPABASE_ANON_KEY") || "";
    if (!supabaseUrl || !apiKey) return json({ error: "Invite service unavailable" }, 503);

    const body = await request.json().catch(() => ({}));
    const storeId = String(body?.store_id ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId)) {
      return json({ error: "Invalid store" }, 400);
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Invalid email" }, 400);
    }

    const invite = await rpc(supabaseUrl, apiKey, authorization, "create_store_invite", {
      p_store_id: storeId,
      p_email: email,
    });
    const token = String(invite?.token ?? "");
    if (!token) throw new Error("Invite link was not created");

    const stores = await rpc(supabaseUrl, apiKey, authorization, "get_my_stores", {});
    const store = Array.isArray(stores) ? stores.find((item) => String(item?.id) === storeId) : null;
    const storeName = String(store?.name || "NAYAD дэлгүүр");
    const link = `https://nayad.store/?invite=${encodeURIComponent(token)}`;

    let sent = false;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    if (resendApiKey) {
      const safeStore = escapeHtml(storeName);
      const safeLink = escapeHtml(link);
      try {
        const delivery = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "NAYAD <noreply@nayad.store>",
            to: [email],
            subject: `NAYAD — ${storeName} дэлгүүрийн урилга`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717"><h2>NAYAD дэлгүүрийн урилга</h2><p>Таныг <b>${safeStore}</b> дэлгүүрийн мэдээллийг хамт удирдахаар урьлаа.</p><p style="margin:28px 0"><a href="${safeLink}" style="background:#ffbf00;color:#111;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;display:inline-block">Урилгыг зөвшөөрөх</a></p><p style="font-size:13px;color:#666">Энэ урилга 7 хоногийн хугацаанд хүчинтэй. NAYAD-д дээрх и-мэйл хаягаараа нэвтэрч зөвшөөрнө үү.</p><p style="font-size:12px;color:#888;word-break:break-all">${safeLink}</p></div>`,
          }),
        });
        const providerResult = await delivery.json().catch(() => ({}));
        sent = delivery.ok;
        if (!sent) {
          console.error("send-store-invite: Resend delivery failed", {
            status: delivery.status,
            code: typeof providerResult?.name === "string" ? providerResult.name : "unknown",
          });
        }
      } catch (error) {
        console.error("send-store-invite: Resend network failure", error);
      }
    }

    if (!sent) sent = await sendWithAuthSmtp(supabaseUrl, apiKey, email, link);
    return sent
      ? json({ sent: true, link })
      : json({ sent: false, link, reason: "EMAIL_DELIVERY_FAILED" });
  } catch (error) {
    console.error("send-store-invite", error);
    return json({ error: error instanceof Error ? error.message : "Invite service unavailable" }, 400);
  }
});

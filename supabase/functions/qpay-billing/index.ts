import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGIN = "https://nayad.store";
const QPAY_BASE_URL = "https://merchant.qpay.mn/v2";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Json = Record<string, unknown>;
type Credentials = { client_name: string; client_password: string; invoice_code: string };
type QPayUrl = { name?: string; description?: string; logo?: string; link?: string };
type Order = {
  id: string;
  store_id: string;
  user_id: string;
  plan_code: string;
  duration_months: number;
  amount: number | string;
  status: string;
  sender_invoice_no: string;
  qpay_invoice_id: string | null;
  qpay_qr_text: string | null;
  qpay_qr_image: string | null;
  qpay_urls: QPayUrl[] | null;
  qpay_short_url: string | null;
  callback_token: string;
  expires_at: string;
};

let tokenCache: { value: string; expiresAt: number } | null = null;

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function publicOrder(order: Order) {
  return {
    order_id: order.id,
    plan_code: order.plan_code,
    amount: Number(order.amount),
    status: order.status,
    qr_text: order.qpay_qr_text,
    qr_image: order.qpay_qr_image,
    urls: Array.isArray(order.qpay_urls) ? order.qpay_urls : [],
    short_url: order.qpay_short_url,
    expires_at: order.expires_at,
  };
}

async function credentials(admin: ReturnType<typeof createClient>): Promise<Credentials> {
  const { data, error } = await admin.rpc("get_qpay_credentials_for_service");
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row?.client_name || !row?.client_password || !row?.invoice_code) {
    throw new Error("QPay merchant configuration is unavailable");
  }
  return row as Credentials;
}

async function qpayToken(creds: Credentials) {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.value;

  const encoded = btoa(`${creds.client_name}:${creds.client_password}`);
  const response = await fetch(`${QPAY_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${encoded}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok || typeof payload.access_token !== "string") {
    throw new Error(`QPay authentication failed (${response.status})`);
  }

  const expiresIn = Number(payload.expires_in ?? 3600);
  const expiresAtValue = Number(payload.expires_at ?? 0);
  const expiresAt = expiresAtValue > 10_000_000_000
    ? expiresAtValue
    : expiresAtValue > 1_000_000_000
      ? expiresAtValue * 1000
      : expiresIn > 1_000_000_000
        ? expiresIn * 1000
        : now + Math.max(60, expiresIn) * 1000;
  tokenCache = { value: payload.access_token, expiresAt };
  return tokenCache.value;
}

async function qpayRequest(creds: Credentials, path: string, body: Json) {
  let token = await qpayToken(creds);
  let response = await fetch(`${QPAY_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) {
    tokenCache = null;
    token = await qpayToken(creds);
    response = await fetch(`${QPAY_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`QPay request failed (${response.status})`);
  return payload;
}

async function authenticatedUser(req: Request, admin: ReturnType<typeof createClient>) {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

async function ownerOf(admin: ReturnType<typeof createClient>, storeId: string, userId: string) {
  const { data, error } = await admin.from("store_members")
    .select("store_id")
    .eq("store_id", storeId)
    .eq("user_id", userId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function createInvoice(req: Request, body: Json, admin: ReturnType<typeof createClient>) {
  const user = await authenticatedUser(req, admin);
  if (!user) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);

  const storeId = String(body.store_id ?? "").trim();
  const planCode = String(body.plan_code ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(storeId) || !["month", "year"].includes(planCode)) {
    return json({ error: "Багцын мэдээлэл буруу байна.", code: "INVALID_INPUT" }, 400);
  }
  if (!await ownerOf(admin, storeId, user.id)) {
    return json({ error: "Зөвхөн дэлгүүрийн эзэмшигч багц авах боломжтой.", code: "OWNER_REQUIRED" }, 403);
  }

  const { data: plan, error: planError } = await admin.from("subscription_plans")
    .select("code,title,amount,duration_months")
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return json({ error: "Сонгосон багц идэвхгүй байна.", code: "PLAN_UNAVAILABLE" }, 400);

  const { data: existing } = await admin.from("qpay_orders")
    .select("*")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("plan_code", planCode)
    .eq("amount", plan.amount)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.qpay_invoice_id) return json({ ...publicOrder(existing as Order), reused: true });

  const senderInvoiceNo = `NAYAD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: order, error: insertError } = await admin.from("qpay_orders").insert({
    store_id: storeId,
    user_id: user.id,
    plan_code: planCode,
    duration_months: plan.duration_months,
    amount: plan.amount,
    sender_invoice_no: senderInvoiceNo,
    expires_at: expiresAt,
  }).select("*").single();
  if (insertError || !order) throw insertError ?? new Error("Order could not be created");

  try {
    const creds = await credentials(admin);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const callbackUrl = `${supabaseUrl}/functions/v1/qpay-billing/callback?token=${order.callback_token}`;
    const invoice = await qpayRequest(creds, "/invoice", {
      invoice_code: creds.invoice_code,
      sender_invoice_no: senderInvoiceNo,
      invoice_receiver_code: storeId,
      invoice_description: `NAYAD Plus - ${String(plan.title)}`,
      amount: Number(plan.amount),
      callback_url: callbackUrl,
    });
    if (typeof invoice.invoice_id !== "string" || !invoice.invoice_id) {
      throw new Error("QPay invoice response is incomplete");
    }
    const { data: updated, error: updateError } = await admin.from("qpay_orders").update({
      status: "pending",
      qpay_invoice_id: invoice.invoice_id,
      qpay_qr_text: typeof invoice.qr_text === "string" ? invoice.qr_text : null,
      qpay_qr_image: typeof invoice.qr_image === "string" ? invoice.qr_image : null,
      qpay_urls: Array.isArray(invoice.urls) ? invoice.urls : [],
      qpay_short_url: typeof invoice.qPay_shortUrl === "string" ? invoice.qPay_shortUrl : null,
      updated_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", order.id).select("*").single();
    if (updateError || !updated) throw updateError ?? new Error("Invoice could not be saved");
    return json(publicOrder(updated as Order), 201);
  } catch (error) {
    await admin.from("qpay_orders").update({
      status: "failed",
      last_error: safeMessage(error).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    throw error;
  }
}

async function verifyPayment(admin: ReturnType<typeof createClient>, order: Order) {
  if (order.status === "paid") {
    const { data: subscription } = await admin.from("store_subscriptions")
      .select("plan_code,current_period_end,status")
      .eq("store_id", order.store_id)
      .maybeSingle();
    return { paid: true, status: "paid", subscription };
  }
  if (!order.qpay_invoice_id) return { paid: false, status: order.status };
  if (new Date(order.expires_at).getTime() <= Date.now()) {
    await admin.from("qpay_orders").update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", order.id).eq("status", "pending");
    return { paid: false, status: "expired" };
  }

  const creds = await credentials(admin);
  const result = await qpayRequest(creds, "/payment/check", {
    object_type: "INVOICE",
    object_id: order.qpay_invoice_id,
    offset: { page_number: 1, page_limit: 100 },
  });
  const rows = Array.isArray(result.rows) ? result.rows as Json[] : [];
  const paidRows = rows.filter(row => String(row.payment_status ?? "").toUpperCase() === "PAID");
  const paidAmount = paidRows.reduce((sum, row) => sum + Number(row.payment_amount ?? row.amount ?? 0), 0);
  if (paidAmount + 0.001 < Number(order.amount)) return { paid: false, status: "pending" };

  const paymentId = String(paidRows[0]?.payment_id ?? "");
  const { data, error } = await admin.rpc("finalize_qpay_order", {
    p_order_id: order.id,
    p_qpay_payment_id: paymentId,
    p_paid_amount: paidAmount,
  });
  if (error) throw error;
  return { paid: true, status: "paid", subscription: data };
}

async function checkInvoice(req: Request, body: Json, admin: ReturnType<typeof createClient>) {
  const user = await authenticatedUser(req, admin);
  if (!user) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);
  const orderId = String(body.order_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "Захиалгын дугаар буруу байна.", code: "INVALID_INPUT" }, 400);
  const { data: order, error } = await admin.from("qpay_orders").select("*")
    .eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!order || !await ownerOf(admin, order.store_id, user.id)) {
    return json({ error: "Захиалга олдсонгүй.", code: "NOT_FOUND" }, 404);
  }
  return json(await verifyPayment(admin, order as Order));
}

async function callback(req: Request, admin: ReturnType<typeof createClient>) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ ok: true });
  const { data: order, error } = await admin.from("qpay_orders").select("*")
    .eq("callback_token", token).maybeSingle();
  if (error) throw error;
  if (!order) return json({ ok: true });
  const result = await verifyPayment(admin, order as Order);
  return json({ ok: true, paid: result.paid });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (!supabaseUrl || !secret) return json({ error: "Төлбөрийн үйлчилгээ түр боломжгүй.", code: "SERVICE_UNAVAILABLE" }, 503);
  const admin = createClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/callback")) return await callback(req, admin);
    if (req.method !== "POST") return json({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405);
    const body = await req.json().catch(() => ({})) as Json;
    if (body.action === "create") return await createInvoice(req, body, admin);
    if (body.action === "check") return await checkInvoice(req, body, admin);
    return json({ error: "Үйлдэл буруу байна.", code: "INVALID_ACTION" }, 400);
  } catch (error) {
    console.error("qpay-billing:", safeMessage(error).replace(/[\r\n]/g, " ").slice(0, 300));
    return json({ error: "QPay үйлчилгээтэй холбогдож чадсангүй. Дахин оролдоно уу.", code: "QPAY_ERROR" }, 502);
  }
});

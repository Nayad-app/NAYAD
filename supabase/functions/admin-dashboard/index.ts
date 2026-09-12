import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGIN = "https://nayad.store";
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function required(name: string) {
  const value = Deno.env.get(name) ?? "";
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function serviceRoleKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacy) return legacy;
  const single = Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
  if (single) return single;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, unknown>;
    if (typeof keys.default === "string") return keys.default;
    return Object.values(keys).find(value => typeof value === "string") as string ?? "";
  } catch {
    return "";
  }
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function rows(result: { data: unknown; error: unknown }, label: string) {
  if (result.error) throw new Error(`${label} query failed`);
  return Array.isArray(result.data) ? result.data as Row[] : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function phone(value: unknown) {
  return text(value).replace(/^\+976/, "");
}

function activeSubscription(row: Row | undefined, now: number) {
  return Boolean(
    row
    && text(row.status) === "active"
    && Date.parse(text(row.current_period_end)) > now
  );
}

async function dashboard(admin: ReturnType<typeof createClient>) {
  const [profileResult, accountResult, membershipResult, storeResult, subscriptionResult, orderResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,phone,created_at").limit(1000),
    admin.from("phone_login_accounts").select("user_id,phone,email,created_at").limit(1000),
    admin.from("store_members").select("store_id,user_id,role,created_at").limit(2000),
    admin.from("stores").select("id,name,business_type,operation_role,entity_type,registration_completed_at,created_at").limit(1000),
    admin.from("store_subscriptions").select("store_id,plan_code,status,current_period_start,current_period_end,last_order_id").limit(1000),
    admin.from("qpay_orders").select("id,store_id,user_id,plan_code,duration_months,amount,status,paid_amount,paid_at,expires_at,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);

  const profiles = rows(profileResult, "profiles");
  const accounts = rows(accountResult, "phone login accounts");
  const memberships = rows(membershipResult, "store memberships");
  const stores = rows(storeResult, "stores");
  const subscriptions = rows(subscriptionResult, "subscriptions");
  const orders = rows(orderResult, "orders");

  const profileById = new Map(profiles.map(row => [text(row.id), row]));
  const accountById = new Map(accounts.map(row => [text(row.user_id), row]));
  const storeById = new Map(stores.map(row => [text(row.id), row]));
  const subscriptionByStore = new Map(subscriptions.map(row => [text(row.store_id), row]));
  const ownerByStore = new Map(
    memberships.filter(row => text(row.role) === "owner").map(row => [text(row.store_id), text(row.user_id)]),
  );
  const ordersByStore = new Map<string, Row[]>();
  for (const order of orders) {
    const storeId = text(order.store_id);
    ordersByStore.set(storeId, [...(ordersByStore.get(storeId) ?? []), order]);
  }

  const users = accounts.map(account => {
    const userId = text(account.user_id);
    const profile = profileById.get(userId) ?? {};
    const registrations = memberships
      .filter(membership => text(membership.user_id) === userId)
      .map(membership => {
        const store = storeById.get(text(membership.store_id)) ?? {};
        return {
          id: text(store.id),
          name: text(store.name),
          operation_role: text(store.operation_role),
          business_type: text(store.business_type),
          entity_type: text(store.entity_type),
          membership_role: text(membership.role),
          is_complete: Boolean(store.registration_completed_at),
          created_at: text(store.created_at),
        };
      });
    return {
      id: userId,
      name: text(profile.full_name) || phone(account.phone) || "Нэр тодорхойгүй",
      phone: phone(account.phone),
      email: text(account.email),
      created_at: text(account.created_at) || text(profile.created_at),
      registrations,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "mn"));

  const now = Date.now();
  const packages = stores.map(store => {
    const storeId = text(store.id);
    const subscription = subscriptionByStore.get(storeId);
    const isPlus = activeSubscription(subscription, now);
    const ownerId = ownerByStore.get(storeId) ?? "";
    const ownerProfile = profileById.get(ownerId) ?? {};
    const ownerAccount = accountById.get(ownerId) ?? {};
    const storeOrders = ordersByStore.get(storeId) ?? [];
    const latestOrder = storeOrders[0];
    const lastPaidOrder = storeOrders.find(order => text(order.status) === "paid");
    const paymentStatus = text(latestOrder?.status) === "pending" ? "pending" : isPlus ? "paid" : "unpaid";
    const paymentOrder = paymentStatus === "pending" ? latestOrder : paymentStatus === "paid" ? lastPaidOrder : undefined;
    return {
      store_id: storeId,
      registration_name: text(store.name),
      owner_name: text(ownerProfile.full_name) || phone(ownerAccount.phone) || "Эзэмшигч тодорхойгүй",
      owner_phone: phone(ownerAccount.phone),
      registration_complete: Boolean(store.registration_completed_at),
      registration_created_at: text(store.created_at),
      plan: isPlus ? "plus" : "free",
      plan_code: isPlus ? text(subscription?.plan_code) : "free",
      status: isPlus ? "active" : "free",
      current_period_start: isPlus ? text(subscription?.current_period_start) : "",
      current_period_end: isPlus ? text(subscription?.current_period_end) : "",
      paid_amount: isPlus ? number(lastPaidOrder?.paid_amount ?? lastPaidOrder?.amount) : 0,
      pending_count: storeOrders.filter(order => text(order.status) === "pending").length,
      payment_status: paymentStatus,
      payment_amount: paymentStatus === "unpaid" ? 0 : number(paymentOrder?.paid_amount ?? paymentOrder?.amount),
      payment_plan_code: paymentStatus === "unpaid" ? "free" : text(paymentOrder?.plan_code),
      payment_duration_months: paymentStatus === "unpaid" ? 0 : number(paymentOrder?.duration_months),
      payment_timestamp: paymentStatus === "paid" ? text(paymentOrder?.paid_at ?? paymentOrder?.created_at) : paymentStatus === "pending" ? text(paymentOrder?.created_at) : text(store.created_at),
    };
  }).sort((a, b) => {
    if (a.plan !== b.plan) return a.plan === "plus" ? -1 : 1;
    return a.registration_name.localeCompare(b.registration_name, "mn");
  });

  const payments = orders.map(order => {
    const store = storeById.get(text(order.store_id)) ?? {};
    const payerId = text(order.user_id);
    const payerProfile = profileById.get(payerId) ?? {};
    const payerAccount = accountById.get(payerId) ?? {};
    return {
      id: text(order.id),
      store_id: text(order.store_id),
      registration_name: text(store.name),
      payer_name: text(payerProfile.full_name) || phone(payerAccount.phone) || "Хэрэглэгч тодорхойгүй",
      payer_phone: phone(payerAccount.phone),
      plan_code: text(order.plan_code),
      duration_months: number(order.duration_months),
      amount: number(text(order.status) === "paid" ? order.paid_amount ?? order.amount : order.amount),
      status: text(order.status),
      paid_at: text(order.paid_at),
      expires_at: text(order.expires_at),
      created_at: text(order.created_at),
      method: "QPay",
    };
  });

  const activePlus = packages.filter(item => item.plan === "plus").length;
  const paidRegistrations = packages.filter(item => item.payment_status === "paid").length;
  const unpaidRegistrations = packages.filter(item => item.payment_status === "unpaid").length;
  const pendingRegistrations = packages.filter(item => item.payment_status === "pending").length;
  const pendingOrders = payments.filter(item => item.status === "pending").length;
  const paidOrders = payments.filter(item => item.status === "paid");

  return {
    overview: {
      user_count: users.length,
      registration_count: stores.length,
      active_plus_count: activePlus,
      free_count: Math.max(0, stores.length - activePlus),
      pending_count: pendingOrders,
      paid_count: paidOrders.length,
      paid_registration_count: paidRegistrations,
      unpaid_registration_count: unpaidRegistrations,
      pending_registration_count: pendingRegistrations,
      total_revenue: paidOrders.reduce((sum, item) => sum + item.amount, 0),
    },
    users,
    packages,
    payments,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = bearer(req);
    if (!token) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);

    const admin = createClient(required("SUPABASE_URL"), serviceRoleKey() || required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);

    const { data: access, error: accessError } = await admin.from("system_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (accessError) throw new Error("Administrator access lookup failed");
    if (!access) return json({ error: "Админы эрх шаардлагатай.", code: "ADMIN_REQUIRED" }, 403);

    const body = await req.json().catch(() => ({})) as Json;
    const action = text(body.action) || "access";
    if (action === "access") return json({ is_admin: true });
    if (action !== "dashboard") return json({ error: "Үйлдэл буруу байна.", code: "INVALID_ACTION" }, 400);

    return json({ is_admin: true, ...(await dashboard(admin)) });
  } catch (error) {
    console.error("admin-dashboard", error instanceof Error ? error.message : String(error));
    return json({ error: "Админы мэдээлэл ачаалж чадсангүй.", code: "ADMIN_DASHBOARD_FAILED" }, 500);
  }
});

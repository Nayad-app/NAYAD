import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://nayad.store",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function removeByIds(admin: ReturnType<typeof createClient>, table: string, column: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== "УСТГАХ") return json({ error: "Confirmation required" }, 400);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required" }, 401);

    const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: "Authentication required" }, 401);
    const userId = user.id;

    const { data: ownedRows, error: ownedError } = await admin.from("store_members")
      .select("store_id").eq("user_id", userId).eq("role", "owner");
    if (ownedError) throw ownedError;
    const ownedStoreIds = [...new Set((ownedRows || []).map((row) => row.store_id).filter(Boolean))] as string[];

    const invoiceIds: string[] = [];
    const imagePaths: string[] = [];
    if (ownedStoreIds.length) {
      const { data: invoices, error: invoiceError } = await admin.from("invoices")
        .select("id").in("store_id", ownedStoreIds);
      if (invoiceError) throw invoiceError;
      invoiceIds.push(...(invoices || []).map((row) => String(row.id)));
      if (invoiceIds.length) {
        const { data: images, error: imageError } = await admin.from("invoice_images")
          .select("image_path").in("invoice_id", invoiceIds);
        if (imageError) throw imageError;
        imagePaths.push(...(images || []).map((row) => row.image_path).filter(Boolean));
      }
    }

    if (imagePaths.length) {
      const storage = admin.storage.from("invoice-images");
      for (let i = 0; i < imagePaths.length; i += 100) {
        const { error } = await storage.remove(imagePaths.slice(i, i + 100));
        if (error) throw error;
      }
    }

    await removeByIds(admin, "payments", "store_id", ownedStoreIds);
    await removeByIds(admin, "invoice_images", "invoice_id", invoiceIds);
    await removeByIds(admin, "invoices", "store_id", ownedStoreIds);
    await removeByIds(admin, "suppliers", "store_id", ownedStoreIds);
    await removeByIds(admin, "store_invites", "store_id", ownedStoreIds);
    await removeByIds(admin, "store_members", "store_id", ownedStoreIds);
    await removeByIds(admin, "stores", "id", ownedStoreIds);

    const { error: memberError } = await admin.from("store_members").delete().eq("user_id", userId);
    if (memberError) throw memberError;
    const { error: inviteError } = await admin.from("store_invites").delete().eq("inviter_id", userId);
    if (inviteError) throw inviteError;
    const { error: phoneError } = await admin.from("phone_login_accounts").delete().eq("user_id", userId);
    if (phoneError) throw phoneError;
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) throw profileError;
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true);
    if (deleteError) throw deleteError;
    return json({ ok: true });
  } catch (error) {
    console.error("delete-account", error);
    return json({ error: error instanceof Error ? error.message : "Account deletion failed" }, 500);
  }
});

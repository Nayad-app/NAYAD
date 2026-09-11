import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGIN = "https://nayad.store";
const CONFIRMATION = "УСТГАХ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Json = Record<string, unknown>;
type DeleteRow = {
  deleted_store_id?: string;
  deleted_store_name?: string;
  invoice_image_paths?: unknown;
  loan_document_paths?: unknown;
};

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

function publicKey() {
  return Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? "";
}

function bearer(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "");
}

function paths(value: unknown, storeId: string) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter(item => typeof item === "string")
    .map(item => String(item).trim())
    .filter(item => {
      const segments = item.split("/");
      return item.length > 0
        && item.length <= 1024
        && !item.startsWith("/")
        && !segments.includes("..")
        && segments[0] === storeId;
    })
  )];
}

async function removePaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  storagePaths: string[],
) {
  for (let index = 0; index < storagePaths.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(storagePaths.slice(index, index + 100));
    if (error) throw error;
  }
}

function rpcFailure(message: string) {
  if (/Authentication required/i.test(message)) {
    return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);
  }
  if (/Confirmation required/i.test(message)) {
    return json({ error: "Баталгаажуулах үгийг яг УСТГАХ гэж оруулна уу.", code: "CONFIRMATION_REQUIRED" }, 400);
  }
  if (/Registration not found or owner access required/i.test(message)) {
    return json({ error: "Зөвхөн тухайн бүртгэлийн эзэмшигч устгах боломжтой.", code: "OWNER_REQUIRED" }, 403);
  }
  if (/Cross-registration (?:payment allocation|relationship) found/i.test(message)) {
    return json({ error: "Бүртгэлийн төлбөрийн холбоосыг шалгах шаардлагатай байна.", code: "DATA_CONFLICT" }, 409);
  }
  return json({ error: "Бүртгэл устгахад алдаа гарлаа.", code: "DELETE_FAILED" }, 500);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({})) as Json;
    const storeId = String(body.store_id ?? "").trim();
    const confirmation = String(body.confirmation ?? "");
    if (!UUID.test(storeId)) return json({ error: "Бүртгэлийн мэдээлэл буруу байна.", code: "INVALID_STORE" }, 400);
    if (confirmation !== CONFIRMATION) {
      return json({ error: "Баталгаажуулах үгийг яг УСТГАХ гэж оруулна уу.", code: "CONFIRMATION_REQUIRED" }, 400);
    }

    const token = bearer(req);
    if (!token) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);

    const url = required("SUPABASE_URL");
    const admin = createClient(url, serviceRoleKey() || required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: "Нэвтрэх шаардлагатай.", code: "UNAUTHORIZED" }, 401);

    const client = createClient(url, publicKey() || required("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.rpc("delete_my_registration", {
      p_store_id: storeId,
      p_confirmation: confirmation,
    });
    if (error) {
      const message = errorMessage(error);
      console.error("delete-registration rpc", { user_id: user.id, store_id: storeId, message });
      return rpcFailure(message);
    }

    const row = (Array.isArray(data) ? data[0] : data) as DeleteRow | null;
    if (!row || String(row.deleted_store_id ?? "") !== storeId) {
      throw new Error("Registration deletion response mismatch");
    }

    const cleanupErrors: string[] = [];
    const cleanup = async (bucket: string, value: unknown) => {
      const exactPaths = paths(value, storeId);
      if (!exactPaths.length) return;
      try {
        await removePaths(admin, bucket, exactPaths);
      } catch (error) {
        cleanupErrors.push(bucket);
        console.error("delete-registration storage", {
          user_id: user.id,
          store_id: storeId,
          bucket,
          message: errorMessage(error),
        });
      }
    };
    await cleanup("invoice-images", row.invoice_image_paths);
    await cleanup("loan-contracts", row.loan_document_paths);

    return json({
      ok: true,
      deleted_store_id: storeId,
      deleted_store_name: String(row.deleted_store_name ?? ""),
      cleanup_pending: cleanupErrors.length > 0,
    });
  } catch (error) {
    console.error("delete-registration", errorMessage(error));
    return json({ error: "Бүртгэл устгахад алдаа гарлаа.", code: "DELETE_FAILED" }, 500);
  }
});

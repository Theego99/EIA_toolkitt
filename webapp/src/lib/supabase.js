import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// isConfigured = true means Supabase is set up and we use real data.
// The explicitly selected demo uses its own durable browser workspace.
export const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

async function boundedFetch(input, init = {}) {
  const controller = new AbortController();
  const parent = init.signal || input?.signal;
  const abort = () => controller.abort(parent.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const url = typeof input === "string" ? input : input?.url || String(input);
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error(
          "接続がタイムアウトしました。端末の記録は残っています。通信状態を確認して再試行してください。",
        ),
      ),
    url.includes("/storage/") ? 120000 : 20000,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
  }
}

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { fetch: boundedFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

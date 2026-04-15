import { createBrowserSupabase, hasConfig, getSessionOrNull } from "./lib/supabase-client.js";

async function route() {
  if (!hasConfig()) {
    window.location.replace("./login.html");
    return;
  }

  const supabase = createBrowserSupabase();
  try {
    const session = await getSessionOrNull(supabase);
    window.location.replace(session?.user ? "./dashboard.html" : "./login.html");
  } catch {
    window.location.replace("./login.html");
  }
}

route();

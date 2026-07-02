const BASE = "https://8cvkfu8m.us-east.insforge.app";
const API_KEY = "ik_dd35cda33f481a1805481b09ea92b0ca";
const H = { "Content-Type": "application/json", Authorization: "Bearer " + API_KEY };

async function api(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let d;
  try { d = JSON.parse(text); } catch { d = text; }
  console.log(method, path, res.status, JSON.stringify(d).slice(0, 400));
  return { status: res.status, data: d };
}

(async () => {
  // Try accessing auth users
  await api("GET", "/api/database/records/auth.users?id=eq.2a4cdc4a-5a82-441c-93e8-c85867013b0f&select=id,email,email_confirmed_at");
  await api("GET", "/api/database/records/auth/users?id=eq.2a4cdc4a-5a82-441c-93e8-c85867013b0f&select=id,email");
  await api("GET", "/api/database/records/%22auth%22.%22users%22?id=eq.2a4cdc4a-5a82-441c-93e8-c85867013b0f&select=id,email");
  await api("GET", "/api/database/records/%22auth%22/users?id=eq.2a4cdc4a-5a82-441c-93e8-c85867013b0f");
  
  // Try raw query endpoint
  await api("POST", "/api/database/query", { query: "SELECT id, email, email_confirmed_at FROM auth.users WHERE id = '2a4cdc4a-5a82-441c-93e8-c85867013b0f'" });
  
  // Try updating auth user email confirmation
  await api("PATCH", "/api/database/records/auth.users?id=eq.2a4cdc4a-5a82-441c-93e8-c85867013b0f", { email_confirmed_at: new Date().toISOString() });
  
  // Try different auth table names - check what tables are accessible
  await api("GET", "/api/database/records/information_schema.tables?table_schema=eq.auth&select=table_name&limit=10");
})();

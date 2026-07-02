import { createClient } from "@insforge/sdk";

const BASE = "https://8cvkfu8m.us-east.insforge.app";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NDcyNjB9.VAHm_7AF1OYonMLZndmFX1v3IEArQdfvSUVo2hjKMS0";
const API_KEY = "ik_dd35cda33f481a1805481b09ea92b0ca";

const USERS = [
  { email: "williamarjun7@gmail.com", id: "2a4cdc4a-5a82-441c-93e8-c85867013b0f", role: "admin", name: "William Arjun", password: "Arjun@39!" },
  { email: "avieshmagar@gmail.com", id: "ada38cfa-0d6c-4698-be8c-b5200f08da84", role: "staff", name: "Aviesh Magar", password: "Aviesh369!" },
];

// Use API key as admin bearer for database ops to bypass RLS
async function dbApi(method, path, body) {
  const url = `${BASE}/api/database${path}`;
  const opts = { method, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function rawFetch(method, path, body, token) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token || ANON}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  const client = createClient({ baseUrl: BASE, anonKey: ANON });

  for (const u of USERS) {
    console.log(`\n=== ${u.email} ===`);

    // 1. Upsert profile using admin API key to bypass RLS
    console.log("Upserting profile...");
    const check = await dbApi("GET", `/records/user_profiles?id=eq.${u.id}&select=id`);
    console.log("  Check:", JSON.stringify(check).slice(0, 200));

    if (check.status === 200 && check.data?.length > 0) {
      const res = await dbApi("PATCH", `/records/user_profiles?id=eq.${u.id}`, { role: u.role, name: u.name, email: u.email });
      console.log("  Update:", res.status, JSON.stringify(res.data).slice(0, 100));
    } else {
      const res = await dbApi("POST", "/records/user_profiles", [{ id: u.id, name: u.name, email: u.email, role: u.role, is_active: true }]);
      console.log("  Insert:", res.status, JSON.stringify(res.data).slice(0, 200));
    }

    // 2. Verify email - try auth admin endpoint
    console.log("Verifying email...");
    
    // Try using the SDK with the API key to sign in as admin
    const adminClient = createClient({ baseUrl: BASE, anonKey: API_KEY }); // try API key as anon to get admin access
    
    // Method 1: try SDK verifyEmail
    const verRes = await rawFetch("POST", "/api/auth/email/verify", { email: u.email, otp: "000000" }, ANON);
    console.log("  Verify attempt:", verRes.status, JSON.stringify(verRes.data).slice(0, 200));

    // Method 2: try an RPC to confirm email
    const rpcRes = await dbApi("POST", `/rpc/confirm_user_email`, { user_id: u.id });
    console.log("  RPC confirm:", rpcRes.status, JSON.stringify(rpcRes.data).slice(0, 200));

    // Method 3: try different RPC names
    for (const fn of ["confirm_user", "admin_verify_email", "verify_user_email", "set_user_email_verified"]) {
      const r = await dbApi("POST", `/rpc/${fn}`, { user_id: u.id });
      if (r.status === 200) console.log(`  RPC ${fn}: OK`);
    }

    // 3. Test sign-in with real password
    console.log("Testing sign-in...");
    const si = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (si.error) {
      console.log("  Sign-in FAIL:", si.error.message);
      // Try signing in with the admin client
      const si2 = await adminClient.auth.signInWithPassword({ email: u.email, password: u.password });
      console.log("  Sign-in (admin client):", si2.error ? si2.error.message : "OK");
    } else {
      console.log("  Sign-in: OK");
    }
  }

  // Final verification
  console.log("\n\n=== Final Profiles ===");
  for (const u of USERS) {
    const { data } = await client.database.from("user_profiles").select("*").eq("id", u.id).single();
    console.log(`${u.email}:`, JSON.stringify(data, null, 2));
  }
  
  // Also try with admin client
  console.log("\n=== Final Profiles (admin) ===");
  const adminClient = createClient({ baseUrl: BASE, anonKey: API_KEY });
  for (const u of USERS) {
    const { data } = await adminClient.database.from("user_profiles").select("*").eq("id", u.id).single();
    console.log(`${u.email}:`, JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);

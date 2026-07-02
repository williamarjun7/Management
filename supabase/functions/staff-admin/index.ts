const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader?.replace('Bearer ', '');
  if (!userToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const adminKey = Deno.env.get('INSFORGE_ADMIN_KEY');
  if (!adminKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { action, userId, email, password, metadata, performed_by } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminKey}`,
    };

    switch (action) {
      case 'update_email': {
        if (!userId || !email) throw new Error('userId and email are required');
        const res = await fetch(`${baseUrl}/api/auth/users/${userId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ email }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || 'Failed to update email');
        return new Response(JSON.stringify({ success: true, user: result }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'reset_password': {
        if (!userId || !password) throw new Error('userId and password are required');
        const res = await fetch(`${baseUrl}/api/auth/users/${userId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ password }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || 'Failed to reset password');
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_user': {
        if (!userId) throw new Error('userId is required');
        const res = await fetch(`${baseUrl}/api/auth/users/${userId}`, { headers });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || 'Failed to get user');
        return new Response(JSON.stringify({ success: true, user: result }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'send_verification': {
        if (!email) throw new Error('email is required');
        const res = await fetch(`${baseUrl}/api/auth/verify-email`, {
          method: 'POST', headers,
          body: JSON.stringify({ email }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || 'Failed to send verification');
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update_metadata': {
        if (!userId || !metadata) throw new Error('userId and metadata are required');
        const res = await fetch(`${baseUrl}/api/auth/users/${userId}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ user_metadata: metadata }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || result.error || 'Failed to update metadata');
        return new Response(JSON.stringify({ success: true, user: result }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resync': {
        const start = Date.now();

        // 1. Fetch all auth users (paginated)
        const authUsers = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await fetch(`${baseUrl}/api/auth/users?page=${page}&per_page=100`, { headers });
          const data = await res.json();
          if (!res.ok) throw new Error(`Failed to list auth users: ${data.message || data.error || res.status}`);
          const users = Array.isArray(data) ? data : (data.users ?? []);
          authUsers.push(...users);
          hasMore = users.length === 100;
          page++;
        }

        // 2. Get all staff records from DB
        const staffRes = await fetch(
          `${baseUrl}/api/rest/v1/staff?select=id,auth_user_id,full_name,username,email,phone,phone_verified,avatar_url,email_verified,verification_status,status,is_active,department,branch,last_login,user_metadata,app_metadata,created_at,updated_at`,
          { headers }
        );
        if (!staffRes.ok) {
          const errBody = await staffRes.text();
          throw new Error(`Failed to fetch staff records: ${errBody}`);
        }
        const staffRecords = await staffRes.json();
        const staffArray = Array.isArray(staffRecords) ? staffRecords : [];

        // 3. Build maps
        const authMap = new Map(authUsers.map(u => [u.id, u]));
        const authByEmail = new Map(
          authUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u])
        );
        const staffByAuthId = new Map(
          staffArray.filter(s => s.auth_user_id).map(s => [s.auth_user_id, s])
        );
        const staffByEmail = new Map(
          staffArray.filter(s => s.email).map(s => [s.email.toLowerCase(), s])
        );

        const report = {
          auth_total: authUsers.length,
          db_total: staffArray.length,
          created: 0,
          updated: 0,
          verification_updated: 0,
          phone_verified_updated: 0,
          email_changed: 0,
          metadata_updated: 0,
          user_metadata_updated: 0,
          app_metadata_updated: 0,
          last_login_updated: 0,
          relationships_repaired: 0,
          orphaned: 0,
          orphaned_records: [],
          errors: [],
        };

        // 4. Detect orphaned DB records (no matching auth user)
        //    And attempt repair by matching email
        for (const staff of staffArray) {
          if (staff.auth_user_id && !authMap.has(staff.auth_user_id)) {
            // Try to repair: match by email
            const matchEmail = staff.email?.toLowerCase();
            const matchingAuth = matchEmail ? authByEmail.get(matchEmail) : null;
            if (matchingAuth) {
              const repairRes = await fetch(
                `${baseUrl}/api/rest/v1/staff?id=eq.${staff.id}`,
                {
                  method: 'PATCH',
                  headers: { ...headers, 'Prefer': 'return=minimal' },
                  body: JSON.stringify({
                    auth_user_id: matchingAuth.id,
                    updated_at: new Date().toISOString(),
                  }),
                }
              );
              if (repairRes.ok) {
                report.relationships_repaired++;
                // Update local state so we don't double-process
                staffByAuthId.set(matchingAuth.id, staff);
              } else {
                report.orphaned++;
                report.orphaned_records.push({ id: staff.id, name: staff.full_name, email: staff.email });
              }
            } else {
              report.orphaned++;
              report.orphaned_records.push({ id: staff.id, name: staff.full_name, email: staff.email });
            }
          }
        }

        // 5. Create/update staff from auth users
        const dbHeaders = { ...headers, 'Prefer': 'return=representation' };
        for (const au of authUsers) {
          try {
            const meta = au.user_metadata || {};
            const appMeta = au.app_metadata || {};
            const existing = staffByAuthId.get(au.id);
            const isEmailVerified = !!(au.confirmed_at || au.email_confirmed_at);
            const isPhoneVerified = !!au.phone_confirmed_at;

            if (!existing) {
              // Create new staff record
              const body = {
                auth_user_id: au.id,
                full_name: meta.full_name || meta.name || au.email?.split('@')[0] || 'Unknown',
                username: meta.username || au.email?.split('@')[0] || `user_${au.id.slice(0, 8)}`,
                email: au.email || null,
                phone: au.phone || null,
                phone_verified: isPhoneVerified,
                email_verified: isEmailVerified,
                avatar_url: meta.avatar_url || meta.avatar || null,
                verification_status: isEmailVerified ? 'verified' : 'pending',
                user_metadata: meta,
                app_metadata: appMeta,
                status: au.disabled ? 'suspended' : 'active',
                is_active: !au.disabled,
                employee_id: `EMP-${au.id.slice(0, 6).toUpperCase()}`,
                department: meta.department || 'other',
                branch: meta.branch || 'main',
                last_login: au.last_sign_in_at || null,
              };
              const res = await fetch(`${baseUrl}/api/rest/v1/staff`, {
                method: 'POST', headers: dbHeaders, body: JSON.stringify(body),
              });
              if (res.ok) report.created++;
              else {
                const errText = await res.text();
                report.errors.push(`Create failed for ${au.email || au.id}: ${errText}`);
              }
            } else {
              // Update existing — write ALL auth-derived fields unconditionally
              // so the DB record is a complete mirror of the auth user.
              // Fields NOT overwritten (admin-managed):
              //   employee_id, department, branch, role_id, position, address, join_date
              const changes = {};

              changes.email = au.email || null;
              changes.phone = au.phone || null;
              changes.full_name = meta.full_name || meta.name || au.email?.split('@')[0] || existing.full_name;
              changes.username = meta.username || au.email?.split('@')[0] || existing.username;
              changes.avatar_url = meta.avatar_url || meta.avatar || null;
              changes.email_verified = isEmailVerified;
              changes.phone_verified = isPhoneVerified;
              changes.verification_status = isEmailVerified ? 'verified' : 'pending';
              changes.status = au.disabled ? 'suspended' : 'active';
              changes.is_active = !au.disabled;
              changes.user_metadata = meta;
              changes.app_metadata = appMeta;
              changes.last_login = au.last_sign_in_at || null;
              changes.updated_at = new Date().toISOString();

              // Track what actually changed for the report
              if (au.email !== existing.email) report.email_changed++;
              if (isPhoneVerified !== existing.phone_verified) report.phone_verified_updated++;
              if (isEmailVerified !== existing.email_verified) report.verification_updated++;
              if (JSON.stringify(meta) !== JSON.stringify(existing.user_metadata || {})) report.user_metadata_updated++;
              if (JSON.stringify(appMeta) !== JSON.stringify(existing.app_metadata || {})) report.app_metadata_updated++;
              if (au.last_sign_in_at !== existing.last_login) report.last_login_updated++;

              const res = await fetch(`${baseUrl}/api/rest/v1/staff?id=eq.${existing.id}`, {
                method: 'PATCH',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify(changes),
              });
              if (res.ok) {
                report.updated++;
                report.metadata_updated++;
              } else {
                const errText = await res.text();
                report.errors.push(`Update failed for ${existing.id}: ${errText}`);
              }
            }
          } catch (err) {
            report.errors.push(`Error processing ${au.email || au.id}: ${err.message}`);
          }
        }

        const duration = ((Date.now() - start) / 1000).toFixed(1);

        // 6. Write audit log for sync operation
        try {
          const auditPayload = {
            p_user_id: performed_by || null,
            p_action: 'STAFF_SYNC',
            p_entity_type: 'staff_directory',
            p_entity_id: 'sync',
            p_previous_state: null,
            p_new_state: null,
            p_reason: 'Staff directory synchronization completed',
            p_event_type: 'STAFF_SYNC_COMPLETED',
            p_metadata: {
              auth_users_processed: authUsers.length,
              db_records_processed: staffArray.length,
              created: report.created,
              updated: report.updated,
              verification_updated: report.verification_updated,
              phone_verified_updated: report.phone_verified_updated,
              email_changed: report.email_changed,
              metadata_updated: report.metadata_updated,
              user_metadata_updated: report.user_metadata_updated,
              app_metadata_updated: report.app_metadata_updated,
              last_login_updated: report.last_login_updated,
              relationships_repaired: report.relationships_repaired,
              orphaned: report.orphaned,
              errors: report.errors.length,
              duration_seconds: duration,
              severity: report.errors.length > 0 ? 'warning' : 'info',
            },
          };
          await fetch(`${baseUrl}/api/rest/v1/rpc/write_frontend_audit`, {
            method: 'POST',
            headers,
            body: JSON.stringify(auditPayload),
          });
        } catch (_auditErr) {
          // Non-fatal — don't fail the sync if audit logging fails
        }

        return new Response(JSON.stringify({ success: true, report: { ...report, duration: `${duration}s` } }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'check_auth': {
        const userIds = body.userIds || body.user_ids;
        if (!Array.isArray(userIds) || userIds.length === 0) {
          return new Response(JSON.stringify({ error: 'userIds array is required' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const statuses = {};
        for (const uid of userIds) {
          if (!uid) { statuses['null'] = { exists: false, confirmed: false, status: 'not_found' }; continue; }
          try {
            const res = await fetch(`${baseUrl}/api/auth/users/${uid}`, { headers });
            if (res.status === 404) {
              statuses[uid] = { exists: false, confirmed: false, status: 'not_found' };
            } else {
              const userData = await res.json();
              const confirmed = !!(userData.confirmed_at || userData.email_confirmed_at);
              statuses[uid] = {
                exists: true,
                confirmed,
                status: confirmed ? 'active' : 'unconfirmed',
              };
            }
          } catch {
            statuses[uid] = { exists: false, confirmed: false, status: 'error' };
          }
        }
        return new Response(JSON.stringify({ success: true, auth_statuses: statuses }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    const message = err?.message || 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

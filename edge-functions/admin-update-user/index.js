export default async function(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;

  if (!userToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const adminKey = Deno.env.get('INSFORGE_ADMIN_KEY');

  if (!adminKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { userId, email, password } = body;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updatePayload = {};
    if (email !== undefined) updatePayload.email = email;
    if (password !== undefined) updatePayload.password = password;

    if (Object.keys(updatePayload).length === 0) {
      return new Response(JSON.stringify({ error: 'Nothing to update' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Update InsForge auth user
    const authRes = await fetch(`${baseUrl}/api/auth/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`,
      },
      body: JSON.stringify(updatePayload),
    });

    const authResult = await authRes.json();

    if (!authRes.ok) {
      return new Response(JSON.stringify({ error: authResult.message || authResult.error || 'Update failed' }), {
        status: authRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Sync user_profiles table (keeps InsForge dashboard + user_profiles in sync)
    if (email !== undefined) {
      const profileRes = await fetch(`${baseUrl}/api/rest/v1/user_profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminKey}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ email }),
      });

      if (!profileRes.ok) {
        const profileErr = await profileRes.text();
        return new Response(JSON.stringify({ error: `Auth updated but profile sync failed: ${profileErr}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true, user: authResult }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

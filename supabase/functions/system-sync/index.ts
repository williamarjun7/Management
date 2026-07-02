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

  const start = Date.now();

  try {
    const body = await req.json();
    const { performed_by } = body;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminKey}`,
    };
    const api = (path, opts = {}) =>
      fetch(`${baseUrl}${path}`, { headers: { ...headers, ...opts.headers }, ...opts });

    // ──────────────────────────────────────────────
    // Helper: run a reconciliation step with timing
    // ──────────────────────────────────────────────
    async function step(name, fn) {
      const t0 = Date.now();
      try {
        const result = await fn();
        return { step: name, ...result, duration_ms: Date.now() - t0 };
      } catch (err) {
        return { step: name, status: 'error', error: err.message, duration_ms: Date.now() - t0 };
      }
    }

    const results = [];

    // ═══════════════════════════════════════════════
    // 1. TABLE STATUS RECONCILIATION
    // ═══════════════════════════════════════════════
    results.push(await step('tables', async () => {
      const [tablesRes, ordersRes, sessionsRes] = await Promise.all([
        api('/api/rest/v1/restaurant_tables?select=id,table_number,status&is_active=eq.true&deleted_at=is.null'),
        api('/api/rest/v1/orders?select=id,table_id,status&status=eq.active'),
        api('/api/rest/v1/table_sessions?select=id,table_id,status&status=eq.active'),
      ]);
      if (!tablesRes.ok) throw new Error(`Cannot fetch tables: ${await tablesRes.text()}`);
      const tables = await tablesRes.json();
      const orders = ordersRes.ok ? (await ordersRes.json()) : [];
      const sessions = sessionsRes.ok ? (await sessionsRes.json()) : [];

      const busyTableIds = new Set([
        ...orders.map(o => o.table_id),
        ...sessions.map(s => s.table_id),
      ]);

      let fixed = 0;
      let errors = [];
      for (const t of tables) {
        const shouldBeBusy = busyTableIds.has(t.id);
        const isBusy = t.status !== 'available';
        if (shouldBeBusy !== isBusy) {
          const newStatus = shouldBeBusy ? 'occupied' : 'available';
          const res = await api(`/api/rest/v1/restaurant_tables?id=eq.${t.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
          });
          if (res.ok) fixed++;
          else errors.push(`Table ${t.table_number}: ${await res.text()}`);
        }
      }
      return { status: 'ok', tables_checked: tables.length, tables_fixed: fixed, errors };
    }));

    // ═══════════════════════════════════════════════
    // 2. INVOICE STATUS RECONCILIATION
    // ═══════════════════════════════════════════════
    results.push(await step('invoices', async () => {
      const invRes = await api('/api/rest/v1/invoices?select=id,invoice_number,status,total&status=neq.cancelled');
      if (!invRes.ok) throw new Error(`Cannot fetch invoices: ${await invRes.text()}`);
      const invoices = await invRes.json();

      const payRes = await api('/api/rest/v1/payment_logs?select=invoice_id,amount,status');
      if (!payRes.ok) throw new Error(`Cannot fetch payment_logs: ${await payRes.text()}`);
      const payments = await payRes.json();

      const paidByInvoice = {};
      for (const p of payments) {
        if (p.status === 'paid' || p.status === 'credit') {
          paidByInvoice[p.invoice_id] = (paidByInvoice[p.invoice_id] || 0) + Number(p.amount);
        }
      }

      let fixed = 0;
      let errors = [];
      for (const inv of invoices) {
        const totalPaid = paidByInvoice[inv.id] || 0;
        let correctStatus;
        if (totalPaid <= 0) correctStatus = 'unpaid';
        else if (totalPaid >= Number(inv.total)) correctStatus = 'paid';
        else correctStatus = 'partial';

        if (inv.status !== correctStatus) {
          const res = await api(`/api/rest/v1/invoices?id=eq.${inv.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: correctStatus, updated_at: new Date().toISOString() }),
          });
          if (res.ok) fixed++;
          else errors.push(`Invoice ${inv.invoice_number}: ${await res.text()}`);
        }
      }
      return { status: 'ok', invoices_checked: invoices.length, invoices_fixed: fixed, errors };
    }));

    // ═══════════════════════════════════════════════
    // 3. ROOM STATUS SYNC
    // ═══════════════════════════════════════════════
    results.push(await step('rooms', async () => {
      const [roomsRes, bookingsRes] = await Promise.all([
        api('/api/rest/v1/rooms?select=id,room_number,status,is_active'),
        api('/api/rest/v1/bookings?select=id,room_id,status,check_in,check_out&status=in.(confirmed,checked_in)'),
      ]);
      if (!roomsRes.ok) throw new Error(`Cannot fetch rooms: ${await roomsRes.text()}`);
      const rooms = await roomsRes.json();
      const bookings = bookingsRes.ok ? (await bookingsRes.json()) : [];

      const occupiedRoomIds = new Set(bookings.map(b => b.room_id));
      let fixed = 0;
      let errors = [];
      for (const r of rooms) {
        const hasBooking = occupiedRoomIds.has(r.id);
        const isOccupied = r.status === 'occupied' || r.status === 'booked';
        if (hasBooking && r.status === 'available') {
          const res = await api(`/api/rest/v1/rooms?id=eq.${r.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'occupied', updated_at: new Date().toISOString() }),
          });
          if (res.ok) fixed++;
          else errors.push(`Room ${r.room_number}: ${await res.text()}`);
        } else if (!hasBooking && isOccupied) {
          const res = await api(`/api/rest/v1/rooms?id=eq.${r.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'available', updated_at: new Date().toISOString() }),
          });
          if (res.ok) fixed++;
          else errors.push(`Room ${r.room_number}: ${await res.text()}`);
        }
      }
      return { status: 'ok', rooms_checked: rooms.length, rooms_fixed: fixed, errors };
    }));

    // ═══════════════════════════════════════════════
    // 4. AUTO-CHECKOUT PAST-DUE BOOKINGS
    // ═══════════════════════════════════════════════
    results.push(await step('auto_checkout', async () => {
      const now = new Date().toISOString();
      const res = await api(
        `/api/rest/v1/bookings?select=id,booking_number,room_id,guest_name,check_out,status&status=eq.checked_in&check_out=lt.${now}`
      );
      if (!res.ok) throw new Error(`Cannot fetch past-due bookings: ${await res.text()}`);
      const pastDue = await res.json();

      let checked_out = 0;
      let rooms_cleaned = 0;
      let errors = [];
      for (const b of pastDue) {
        const updRes = await api(`/api/rest/v1/bookings?id=eq.${b.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'checked_out', updated_at: now }),
        });
        if (updRes.ok) {
          checked_out++;
          if (b.room_id) {
            const roomRes = await api(`/api/rest/v1/rooms?id=eq.${b.room_id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'cleaning', updated_at: now }),
            });
            if (roomRes.ok) rooms_cleaned++;
            else errors.push(`Room ${b.room_id} status update: ${await roomRes.text()}`);
          }
        } else {
          errors.push(`Booking ${b.booking_number}: ${await updRes.text()}`);
        }
      }
      return { status: 'ok', past_due_found: pastDue.length, checked_out, rooms_set_cleaning: rooms_cleaned, errors };
    }));

    // ═══════════════════════════════════════════════
    // 5. CUSTOMER BALANCE VERIFICATION
    // ═══════════════════════════════════════════════
    results.push(await step('customers', async () => {
      const custRes = await api('/api/rest/v1/customers?select=id,name,phone,outstanding_balance');
      if (!custRes.ok) throw new Error(`Cannot fetch customers: ${await custRes.text()}`);
      const customers = await custRes.json();

      const ledgerRes = await api('/api/rest/v1/customer_ledger_entries?select=customer_id,amount,entry_type');
      if (!ledgerRes.ok) throw new Error(`Cannot fetch ledger: ${await ledgerRes.text()}`);
      const entries = await ledgerRes.json();

      const balanceByCustomer = {};
      for (const e of entries) {
        if (!balanceByCustomer[e.customer_id]) balanceByCustomer[e.customer_id] = 0;
        if (e.entry_type === 'credit') balanceByCustomer[e.customer_id] += Number(e.amount);
        else if (e.entry_type === 'payment') balanceByCustomer[e.customer_id] -= Number(e.amount);
      }

      let fixed = 0;
      let errors = [];
      for (const c of customers) {
        const calculated = balanceByCustomer[c.id] || 0;
        const stored = Number(c.outstanding_balance || 0);
        if (Math.abs(calculated - stored) > 0.01) {
          const res = await api(`/api/rest/v1/customers?id=eq.${c.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ outstanding_balance: calculated, updated_at: new Date().toISOString() }),
          });
          if (res.ok) fixed++;
          else errors.push(`Customer ${c.name || c.id}: ${await res.text()}`);
        }
      }
      return { status: 'ok', customers_checked: customers.length, balances_fixed: fixed, errors };
    }));

    // ═══════════════════════════════════════════════
    // 6. STOCK RUNNING BALANCE REBUILD
    // ═══════════════════════════════════════════════
    results.push(await step('stock_balance', async () => {
      const prodRes = await api('/api/rest/v1/products?select=id,name,sku,reorder_level');
      if (!prodRes.ok) throw new Error(`Cannot fetch products: ${await prodRes.text()}`);
      const products = await prodRes.json();

      const movRes = await api('/api/rest/v1/stock_movements?select=id,product_id,quantity,movement_type,created_at&order=created_at.asc');
      if (!movRes.ok) throw new Error(`Cannot fetch stock movements: ${await movRes.text()}`);
      const movements = await movRes.json();

      const runningByProduct = {};
      // Replay all movements chronologically
      for (const m of movements) {
        if (!runningByProduct[m.product_id]) runningByProduct[m.product_id] = 0;
        const qty = Number(m.quantity);
        if (m.movement_type === 'purchase' || m.movement_type === 'adjustment' || m.movement_type === 'sale' || m.movement_type === 'wastage' || m.movement_type === 'room_usage') {
          // purchase = incoming, everything else = outgoing
          if (m.movement_type === 'purchase' || m.movement_type === 'adjustment') {
            runningByProduct[m.product_id] += qty;
          } else {
            runningByProduct[m.product_id] -= qty;
          }
        }
      }

      let balances_fixed = 0;
      let low_stock = [];
      let errors = [];
      for (const p of products) {
        const calculated = runningByProduct[p.id] || 0;
        // Recalculate running_balance by replaying movements for this product
        const prodMovements = movements.filter(m => m.product_id === p.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let running = 0;
        for (const m of prodMovements) {
          const qty = Number(m.quantity);
          if (m.movement_type === 'purchase') running += qty;
          else if (m.movement_type === 'adjustment') running += qty;
          else running -= qty;
          if (Math.abs(running - Number(m.running_balance || 0)) > 0.001) {
            // Fix the running_balance on this movement
            await api(`/api/rest/v1/stock_movements?id=eq.${m.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ running_balance: running }),
            });
          }
        }
        if (calculated !== Number(p.reorder_level || 0) && calculated <= Number(p.reorder_level || 0)) {
          low_stock.push({ id: p.id, name: p.name, sku: p.sku, current_stock: calculated, reorder_level: p.reorder_level });
        }
      }
      return { status: 'ok', products_checked: products.length, balances_fixed, low_stock_count: low_stock.length, low_stock_items: low_stock.slice(0, 50), errors };
    }));

    // ═══════════════════════════════════════════════
    // 7. EXPIRED INVENTORY HOLD RELEASE
    // ═══════════════════════════════════════════════
    results.push(await step('inventory_holds', async () => {
      const now = new Date().toISOString();
      const res = await api(
        `/api/rest/v1/inventory_holds?select=id,product_id,quantity,expires_at,status&status=eq.active&expires_at=lt.${now}`
      );
      if (!res.ok) throw new Error(`Cannot fetch inventory holds: ${await res.text()}`);
      const expired = await res.json();

      let released = 0;
      let errors = [];
      for (const h of expired) {
        const relRes = await api(`/api/rest/v1/inventory_holds?id=eq.${h.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'released', updated_at: now }),
        });
        if (relRes.ok) released++;
        else errors.push(`Hold ${h.id}: ${await relRes.text()}`);
      }
      return { status: 'ok', expired_found: expired.length, released, errors };
    }));

    // ═══════════════════════════════════════════════
    // 8. ORPHANED REFERENCE DETECTION
    // ═══════════════════════════════════════════════
    results.push(await step('orphans', async () => {
      // Orders referencing deleted/inactive tables
      const activeTablesRes = await api('/api/rest/v1/restaurant_tables?select=id&deleted_at=is.null&is_active=eq.true');
      const activeTables = activeTablesRes.ok ? (await activeTablesRes.json()).map(t => t.id) : [];
      const allOrdersRes = await api('/api/rest/v1/orders?select=id,order_number,table_id,status');
      const allOrders = allOrdersRes.ok ? (await allOrdersRes.json()) : [];
      const orphanedOrders = allOrders.filter(o => o.table_id && !activeTables.includes(o.table_id));

      // Room services referencing deleted bookings or rooms
      const activeRoomsRes = await api('/api/rest/v1/rooms?select=id&is_active=eq.true');
      const activeRooms = activeRoomsRes.ok ? (await activeRoomsRes.json()).map(r => r.id) : [];
      const servicesRes = await api('/api/rest/v1/room_services?select=id,description,room_id');
      const services = servicesRes.ok ? (await servicesRes.json()) : [];
      const orphanedServices = services.filter(s => s.room_id && !activeRooms.includes(s.room_id));

      return {
        status: 'ok',
        orders_with_deleted_table: orphanedOrders.length,
        orphaned_order_list: orphanedOrders.slice(0, 30).map(o => ({ id: o.id, order_number: o.order_number, table_id: o.table_id })),
        room_services_with_deleted_room: orphanedServices.length,
        orphaned_service_list: orphanedServices.slice(0, 30).map(s => ({ id: s.id, description: s.description })),
        errors: [],
      };
    }));

    // ═══════════════════════════════════════════════
    // COMPILE REPORT
    // ═══════════════════════════════════════════════
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    const totalErrors = results.reduce((sum, r) => sum + (r.errors?.length || 0), 0);

    const report = {
      duration: `${duration}s`,
      results,
      summary: {
        tables_fixed: results.find(r => r.step === 'tables')?.tables_fixed || 0,
        invoices_fixed: results.find(r => r.step === 'invoices')?.invoices_fixed || 0,
        rooms_fixed: results.find(r => r.step === 'rooms')?.rooms_fixed || 0,
        auto_checked_out: results.find(r => r.step === 'auto_checkout')?.checked_out || 0,
        balances_fixed: results.find(r => r.step === 'customers')?.balances_fixed || 0,
        stock_fixed: results.find(r => r.step === 'stock_balance')?.balances_fixed || 0,
        low_stock_count: results.find(r => r.step === 'stock_balance')?.low_stock_count || 0,
        inventory_holds_released: results.find(r => r.step === 'inventory_holds')?.released || 0,
        orphaned_orders: results.find(r => r.step === 'orphans')?.orders_with_deleted_table || 0,
        orphaned_services: results.find(r => r.step === 'orphans')?.room_services_with_deleted_room || 0,
        total_errors: totalErrors,
      },
      errors: results.filter(r => r.errors?.length > 0).flatMap(r => r.errors.map(e => `[${r.step}] ${e}`)),
    };

    // Write audit log
    try {
      await api('/api/rest/v1/rpc/write_frontend_audit', {
        method: 'POST',
        body: JSON.stringify({
          p_user_id: performed_by || null,
          p_action: 'SYSTEM_SYNC',
          p_entity_type: 'system',
          p_entity_id: 'sync',
          p_reason: 'Full system synchronization completed',
          p_event_type: 'SYSTEM_SYNC_COMPLETED',
          p_metadata: {
            duration_seconds: duration,
            tables_fixed: report.summary.tables_fixed,
            invoices_fixed: report.summary.invoices_fixed,
            rooms_fixed: report.summary.rooms_fixed,
            auto_checked_out: report.summary.auto_checked_out,
            balances_fixed: report.summary.balances_fixed,
            stock_fixed: report.summary.stock_fixed,
            low_stock_count: report.summary.low_stock_count,
            inventory_holds_released: report.summary.inventory_holds_released,
            orphaned_orders: report.summary.orphaned_orders,
            orphaned_services: report.summary.orphaned_services,
            errors: totalErrors,
            severity: totalErrors > 0 ? 'warning' : 'info',
          },
        }),
      });
    } catch (_ae) {
      // non-fatal
    }

    return new Response(JSON.stringify({ success: true, report }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err?.message || 'Internal error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

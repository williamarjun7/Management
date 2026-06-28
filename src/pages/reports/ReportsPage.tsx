import { useState } from 'react';
import { useOrders, useRooms, useProducts } from '../../lib/hooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Card } from '../../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs';
import { exportCsv } from '../../lib/services/csv-export';
import type { Order, Room, Product } from '../../types';
import { TrendingUp, Bed, Package, DollarSign, Download } from 'lucide-react';

export default function ReportsPage() {
  const [period, setPeriod] = useState('today');
  const { data: orders } = useOrders();
  const { data: rooms } = useRooms();
  const { data: products } = useProducts();

  const completedOrders = (orders ?? []).filter(
    (o: Order) => o.status === 'completed'
  );
  const totalRevenue = completedOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalOrders = completedOrders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const occupiedRooms = (rooms ?? []).filter((r) => r.status === 'occupied').length;
  const totalRooms = (rooms ?? []).length;
  const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : '0.0';

  const lowStockItems = (products ?? []).filter(
    (p) => p.reorder_level != null
  ).length;

  function handleExportAll() {
    const date = new Date().toISOString().split('T')[0];
    const rows = [
      ...completedOrders.map((o: Order) => ({
        section: 'Order',
        id: o.order_number?.slice(0, 8) || o.id.slice(0, 8),
        detail: o.restaurant_tables?.table_number ? `T${o.restaurant_tables.table_number}` : '',
        amount: Number(o.total).toFixed(2),
        status: o.status,
        extra: new Date(o.created_at).toLocaleDateString(),
      })),
      ...(rooms ?? []).map((r: Room) => ({
        section: 'Room',
        id: r.room_number,
        detail: r.room_types?.name ?? '',
        amount: '',
        status: r.status,
        extra: r.room_types?.name ?? '',
      })),
      ...(products ?? []).map((p: Product) => ({
        section: 'Product',
        id: p.name,
        detail: p.category ?? '',
        amount: '',
        status: p.unit,
        extra: p.reorder_level != null ? String(p.reorder_level) : '',
      })),
    ];
    exportCsv(
      rows,
      [
        { label: 'Section', value: (r) => r.section },
        { label: 'ID / Name', value: (r) => r.id },
        { label: 'Detail', value: (r) => r.detail },
        { label: 'Amount / Unit', value: (r) => r.amount || r.status },
        { label: 'Status / Category', value: (r) => r.extra },
      ],
      `report-${date}`
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Sales, occupancy, and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors min-h-[44px]"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Total Revenue</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold">Rs. {totalRevenue.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalOrders} orders</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Avg Order Value</span>
            <TrendingUp className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold">Rs. {avgOrderValue.toFixed(2)}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Occupancy</span>
            <Bed className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{occupancyRate}%</p>
          <p className="text-xs text-muted-foreground mt-1">{occupiedRooms}/{totalRooms} rooms</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground uppercase">Products</span>
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{(products ?? []).length}</p>
          <p className="text-xs text-muted-foreground mt-1">{lowStockItems} low stock</p>
        </Card>
      </div>

      <Tabs defaultValue="orders">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="orders" className="mt-4">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No completed orders</TableCell>
                  </TableRow>
                ) : (
                  completedOrders.slice(0, 20).map((o: Order) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.order_number?.slice(0, 8) || o.id.slice(0, 8)}</TableCell>
                      <TableCell>{o.restaurant_tables?.table_number ? `T${o.restaurant_tables.table_number}` : '—'}</TableCell>
                      <TableCell>Rs. {Number(o.total).toFixed(2)}</TableCell>
                      <TableCell className="capitalize">{o.status}</TableCell>
                      <TableCell className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        <TabsContent value="rooms" className="mt-4">
          <Card className="p-5">
            {rooms?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No room data</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Floor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rooms ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.room_number}</TableCell>
                      <TableCell>{r.room_types?.name ?? '—'}</TableCell>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell>{r.room_types?.name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="products" className="mt-4">
          <Card className="p-5">
            {products?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No products</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Reorder Level</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(products ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.category ?? '—'}</TableCell>
                      <TableCell>{p.unit}</TableCell>
                      <TableCell>{p.reorder_level ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

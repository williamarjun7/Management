import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers, useCheckDuplicateCustomer, useCreateCustomer } from '../../lib/hooks/customers.hooks';
import { useCustomerCreditSummary } from '../../lib/hooks/customers.hooks';
import { formatCurrency } from '../../lib/core/format-currency';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Search, Plus, Users, CreditCard, TrendingUp, DollarSign } from 'lucide-react';
import type { Customer } from '../../lib/hooks/customers.hooks';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500',
  inactive: 'bg-slate-500',
  blocked: 'bg-red-500',
};

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [duplicates, setDuplicates] = useState<Array<Record<string, unknown>> | null>(null);
  const { data: customers, isLoading } = useCustomers(search || undefined);
  const { data: summary } = useCustomerCreditSummary();
  const checkDuplicate = useCheckDuplicateCustomer();
  const createCustomer = useCreateCustomer();

  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '', credit_limit: 0 });

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const dupResult = await checkDuplicate.mutateAsync({
      p_name: form.name,
      p_phone: form.phone || undefined,
    });
    if (dupResult?.has_duplicates) {
      setDuplicates(dupResult.matches);
      return;
    }
    await doCreate();
  };

  const doCreate = async () => {
    await createCustomer.mutateAsync({
      p_name: form.name,
      p_phone: form.phone || undefined,
      p_address: form.address || undefined,
      p_notes: form.notes || undefined,
      p_credit_limit: form.credit_limit || 0,
    });
    setShowCreate(false);
    setForm({ name: '', phone: '', address: '', notes: '', credit_limit: 0 });
  };

  const handleForceCreate = async () => {
    setDuplicates(null);
    await doCreate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.customer_count || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
              <CreditCard className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{formatCurrency(summary.total_outstanding)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Credit Taken</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(summary.total_credit)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{formatCurrency(summary.total_paid)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone, or customer ID..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : customers && customers.length > 0 ? (
        <div className="grid gap-4">
          {customers.map((customer: Customer) => (
            <Link
              key={customer.id}
              to={`/customers/${customer.id}`}
              className="block p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{customer.name}</span>
                      <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[customer.status] || 'bg-slate-500'}`} />
                      {customer.outstanding_balance > 0 && (
                        <Badge variant="destructive" className="text-xs">Due</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {customer.customer_id}
                      {customer.phone && ` · ${customer.phone}`}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${customer.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {customer.outstanding_balance > 0 ? formatCurrency(customer.outstanding_balance) : 'Cleared'}
                  </div>
                  {customer.credit_limit > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Limit: {formatCurrency(customer.credit_limit)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No customers found</p>
          <Button variant="outline" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add First Customer
          </Button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>Enter customer details. Phone number is optional.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Customer Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Phone Number</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="98XXXXXXXX"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Address</label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Address (optional)"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes (optional)"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Credit Limit</label>
              <Input
                type="number"
                value={form.credit_limit}
                onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
                placeholder="0 = no limit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name.trim() || createCustomer.isPending}>
              {createCustomer.isPending ? 'Creating...' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!duplicates} onOpenChange={() => setDuplicates(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possible Duplicate Found</DialogTitle>
            <DialogDescription>
              A customer with similar details already exists. Please select the existing customer or create a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {duplicates?.map((dup: Record<string, unknown>) => (
              <Link
                key={dup.id as string}
                to={`/customers/${dup.id}`}
                onClick={() => setDuplicates(null)}
                className="block p-3 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className="font-medium">{dup.name as string}</div>
                <div className="text-sm text-muted-foreground">{dup.customer_id as string} · {dup.phone as string || 'No phone'}</div>
                <div className="text-sm">Balance: {formatCurrency(Number(dup.outstanding_balance))}</div>
              </Link>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDuplicates(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleForceCreate}>Create Anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

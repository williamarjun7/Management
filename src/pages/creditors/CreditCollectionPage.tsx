import { useState } from 'react';
import { useCreditCustomersList, useCustomerOutstandingInvoices, useSettleCreditPayment } from '../../lib/hooks/customers.hooks';
import { useAuth } from '../../lib/core/auth-context';
import { formatCurrency } from '../../lib/core/format-currency';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { showSuccess, showError } from '../../components/ui/toast';
import { CreditCard, Users, Search, DollarSign, Calendar, AlertCircle, TrendingUp, Phone, ChevronRight } from 'lucide-react';
import type { CreditCustomerSummary, OutstandingInvoice } from '../../types';

export default function CreditCollectionPage() {
  const { user } = useAuth();
  const { data: creditCustomers, isLoading } = useCreditCustomersList();
  const settlePayment = useSettleCreditPayment();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showSettle, setShowSettle] = useState(false);
  const [settleAmount, setSettleAmount] = useState(0);
  const [search, setSearch] = useState('');

  const { data: outstandingInvoices } = useCustomerOutstandingInvoices(selectedCustomerId ?? undefined);

  const selectedCustomer = creditCustomers?.find(c => c.id === selectedCustomerId);

  const totalOutstanding = creditCustomers?.reduce((s, c) => s + Number(c.outstanding_balance), 0) ?? 0;
  const totalCreditTaken = creditCustomers?.reduce((s, c) => s + Number(c.total_credit_taken), 0) ?? 0;
  const totalPaid = creditCustomers?.reduce((s, c) => s + Number(c.total_amount_paid), 0) ?? 0;

  const filteredCustomers = creditCustomers?.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.phone && c.phone.toLowerCase().includes(q));
  }) ?? [];

  const handleSettlePayment = async () => {
    if (!user || !selectedCustomer || settleAmount <= 0) return;
    try {
      await settlePayment.mutateAsync({
        p_customer_id: selectedCustomer.id,
        p_amount: settleAmount,
        p_processed_by: user.id,
        p_idempotency_key: `settle:${selectedCustomer.id}:${Date.now()}`,
        p_notes: 'Credit collection settlement',
      });
      showSuccess(`Payment of ${formatCurrency(settleAmount)} received from ${selectedCustomer.name}`);
      setShowSettle(false);
      setSettleAmount(0);
    } catch (err) {
      showError((err as Error)?.message || 'Settlement failed');
    }
  };

  return (
    <div className="space-y-6 border-t-4 border-t-amber-500 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-600 dark:text-amber-400">Credit Collection</h1>
          <p className="text-sm text-muted-foreground">Manage outstanding credit and collect payments</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 w-full sm:w-64"
            placeholder="Search credit customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Customers with Credit</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{creditCustomers?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
            <CreditCard className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Credit Taken</CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalCreditTaken)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Credit Customers</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{search ? 'No matching customers' : 'No credit customers found'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((customer: CreditCustomerSummary) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomerId(customer.id === selectedCustomerId ? null : customer.id);
                    setShowSettle(false);
                  }}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    selectedCustomerId === customer.id
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20 ring-1 ring-amber-500'
                      : 'bg-card hover:bg-accent/50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center font-semibold text-amber-700 dark:text-amber-300 shrink-0">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{customer.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {customer.phone && <><Phone className="h-3 w-3 inline mr-1" />{customer.phone} · </>}
                          {customer.unpaid_invoice_count} invoice{customer.unpaid_invoice_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="font-medium text-destructive">{formatCurrency(Number(customer.outstanding_balance))}</div>
                      {customer.credit_limit > 0 && (
                        <div className="text-xs text-muted-foreground">
                          Limit: {formatCurrency(customer.credit_limit)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    {customer.last_payment_date && (
                      <span>
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Last payment: {new Date(customer.last_payment_date).toLocaleDateString()}
                      </span>
                    )}
                    {customer.oldest_invoice_date && (
                      <span>
                        <AlertCircle className="h-3 w-3 inline mr-1" />
                        Oldest: {new Date(customer.oldest_invoice_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {selectedCustomer ? `${selectedCustomer.name}'s Invoices` : 'Invoice Details'}
            </h2>
            {selectedCustomer && Number(selectedCustomer.outstanding_balance) > 0 && (
              <Button onClick={() => { setSettleAmount(Number(selectedCustomer.outstanding_balance)); setShowSettle(true); }} size="sm">
                <DollarSign className="h-4 w-4 mr-2" />
                Collect Payment
              </Button>
            )}
          </div>

          {!selectedCustomer ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">
              <ChevronRight className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Select a customer to view invoices</p>
            </div>
          ) : outstandingInvoices && outstandingInvoices.length > 0 ? (
            <div className="space-y-2">
              {outstandingInvoices.map((inv: OutstandingInvoice) => (
                <div key={inv.id} className="p-3 rounded-lg border bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{inv.invoice_number}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <Badge variant={inv.status === 'credit' ? 'destructive' : 'secondary'}>
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-sm">
                    <span className="text-muted-foreground">Total: {formatCurrency(Number(inv.total))}</span>
                    <span className="text-emerald-600">Paid: {formatCurrency(Number(inv.paid_amount))}</span>
                    <span className="text-destructive font-medium">Due: {formatCurrency(Number(inv.remaining))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border rounded-lg bg-card">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No outstanding invoices</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showSettle} onOpenChange={setShowSettle}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collect Payment</DialogTitle>
            <DialogDescription>
              {selectedCustomer && (
                <span>Receiving payment from <strong>{selectedCustomer.name}</strong></span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {selectedCustomer && (
              <div className="rounded-lg border bg-muted p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outstanding Balance</span>
                  <span className="font-medium text-destructive">{formatCurrency(Number(selectedCustomer.outstanding_balance))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Credit Limit</span>
                  <span>{formatCurrency(Number(selectedCustomer.credit_limit))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unpaid Invoices</span>
                  <span>{selectedCustomer.unpaid_invoice_count}</span>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Payment Amount</label>
              <Input
                type="number"
                value={settleAmount || ''}
                onChange={(e) => setSettleAmount(Math.min(Number(e.target.value), Number(selectedCustomer?.outstanding_balance ?? 0)))}
                placeholder="Enter amount"
                max={selectedCustomer?.outstanding_balance}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[500, 1000, 2000, 5000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setSettleAmount(Math.min(amt, Number(selectedCustomer?.outstanding_balance ?? 0)))}
                  disabled={amt > Number(selectedCustomer?.outstanding_balance ?? 0)}
                >
                  Rs.{amt}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettleAmount(Number(selectedCustomer?.outstanding_balance ?? 0))}
              >
                Full
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettle(false)}>Cancel</Button>
            <Button
              onClick={handleSettlePayment}
              disabled={settleAmount <= 0 || settlePayment.isPending}
            >
              {settlePayment.isPending ? 'Processing...' : `Collect ${formatCurrency(settleAmount)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

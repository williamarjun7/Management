import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useCustomer, useCustomerLedger, useRecordCustomerPayment } from '../../lib/hooks/customers.hooks';
import { formatCurrency } from '../../lib/core/format-currency';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { ArrowLeft, CreditCard, DollarSign, TrendingUp, Calendar, FileText, Phone, MapPin, Shield, AlertCircle } from 'lucide-react';

const ENTRY_TYPE_COLORS: Record<string, string> = {
  credit: 'text-destructive',
  payment: 'text-emerald-600',
  adjustment: 'text-amber-600',
  refund: 'text-blue-600',
  debit: 'text-destructive',
};

const ENTRY_TYPE_LABELS: Record<string, string> = {
  credit: 'Credit Purchase',
  payment: 'Payment Received',
  adjustment: 'Adjustment',
  refund: 'Refund',
  debit: 'Credit Purchase',
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading } = useCustomer(id);
  const { data: ledger } = useCustomerLedger(id);
  const recordPayment = useRecordCustomerPayment();
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);

  const handlePayment = async () => {
    if (!id || paymentAmount <= 0) return;
    await recordPayment.mutateAsync({
      p_customer_id: id,
      p_amount: paymentAmount,
      p_description: 'Payment received',
    });
    setShowPayment(false);
    setPaymentAmount(0);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Customer not found</p>
        <Link to="/customers" className="text-primary hover:underline mt-2 inline-block">Back to Customers</Link>
      </div>
    );
  }

  const availableCredit = customer.credit_limit > 0
    ? Math.max(0, customer.credit_limit - customer.outstanding_balance)
    : null;

  return (
    <div className="space-y-6 border-t-4 border-t-pink-500 pt-4">
      <div className="flex items-center gap-4">
        <Link to="/customers" className="p-2 rounded-md hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-pink-600 dark:text-pink-400">{customer.name}</h1>
            <Badge variant={customer.status === 'active' ? 'default' : customer.status === 'blocked' ? 'destructive' : 'secondary'}>
              {customer.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{customer.customer_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Balance</CardTitle>
            <CreditCard className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${customer.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {formatCurrency(customer.outstanding_balance)}
            </div>
            {availableCredit !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Available: {formatCurrency(availableCredit)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Credit Taken</CardTitle>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(customer.total_credit_taken)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{formatCurrency(customer.total_amount_paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Credit Limit</CardTitle>
            <Shield className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(customer.credit_limit)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ledger History</h2>
            <Button
              onClick={() => setShowPayment(true)}
              disabled={customer.outstanding_balance <= 0}
              size="sm"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Receive Payment
            </Button>
          </div>

          {customer.outstanding_balance > 0 && (
            <div className="p-4 rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Outstanding balance of {formatCurrency(customer.outstanding_balance)}. 
                Credit limit: {formatCurrency(customer.credit_limit)}.
              </p>
            </div>
          )}

          {ledger && ledger.length > 0 ? (
            <div className="space-y-2">
              <div className="p-3 rounded-lg border bg-muted/50">
                <div className="text-sm text-muted-foreground">Opening Balance</div>
                <div className="text-lg font-semibold">{formatCurrency(0)}</div>
              </div>
              {[...ledger].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${entry.entry_type === 'credit' ? 'bg-red-500' : entry.entry_type === 'payment' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <div>
                        <div className="font-medium text-sm">
                          {entry.description || ENTRY_TYPE_LABELS[entry.entry_type] || entry.entry_type}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${ENTRY_TYPE_COLORS[entry.entry_type] || ''}`}>
                        {entry.entry_type === 'payment' || entry.entry_type === 'refund' ? '-' : '+'}
                        {formatCurrency(entry.amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Balance: {formatCurrency(entry.running_balance)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="p-3 rounded-lg border bg-card font-semibold">
                <div className="flex items-center justify-between">
                  <span>Current Balance</span>
                  <span className={customer.outstanding_balance > 0 ? 'text-destructive' : 'text-emerald-600'}>
                    {formatCurrency(customer.outstanding_balance)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No ledger entries yet</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Customer Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.phone || 'No phone'}</span>
              </div>
              {customer.phone_secondary && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.phone_secondary}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{customer.address || 'No address'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Last visit: {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString() : 'Never'}</span>
              </div>
            </CardContent>
          </Card>

          {customer.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{customer.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full"
                size="sm"
                onClick={() => setShowPayment(true)}
                disabled={customer.outstanding_balance <= 0}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Receive Payment
              </Button>
              <Link to="/pos" className="block">
                <Button variant="outline" className="w-full" size="sm">
                  <CreditCard className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
            <DialogDescription>
              Outstanding: {formatCurrency(customer.outstanding_balance)}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Payment Amount</label>
              <Input
                type="number"
                value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(Math.min(Number(e.target.value), customer.outstanding_balance))}
                placeholder="Enter amount"
                max={customer.outstanding_balance}
              />
            </div>
            <div className="flex gap-2">
              {[500, 1000, 2000, 5000].map((amt) => (
                <Button
                  key={amt}
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentAmount(Math.min(amt, customer.outstanding_balance))}
                  disabled={amt > customer.outstanding_balance}
                >
                  Rs.{amt}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPaymentAmount(customer.outstanding_balance)}
              >
                Full
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>Cancel</Button>
            <Button
              onClick={handlePayment}
              disabled={paymentAmount <= 0 || recordPayment.isPending}
            >
              {recordPayment.isPending ? 'Processing...' : `Receive ${formatCurrency(paymentAmount)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Receipt, DollarSign, TrendingUp, Clock, Trash2 } from "lucide-react";
import { useInvoices, useDeleteInvoice } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { formatCurrency } from "../../lib/core/format-currency";
import type { Invoice } from "../../types";

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "paid": return "default" as const;
    case "unpaid": return "destructive" as const;
    case "partial": return "secondary" as const;
    case "refunded": return "outline" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function BillingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("all");
  const { data: invoices, isLoading } = useInvoices(activeTab);
  const deleteInvoice = useDeleteInvoice();
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<Invoice | null>(null);

  const totalUnpaid = invoices?.filter((i) => i.status === "unpaid" || i.status === "partial")
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const todayStr = new Date().toISOString().split("T")[0];
  const totalPaidToday = invoices?.filter(
    (i) => i.status === "paid" && i.created_at?.startsWith(todayStr)
  ).reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const totalOutstanding = invoices?.filter((i) => i.status !== "paid" && i.status !== "refunded")
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const totalRevenue = invoices?.filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0) ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">Manage invoices, payments, and transactions.</p>
        </div>
        <Button onClick={() => navigate("/billing/new")} className="min-h-[44px]">
          <Plus className="mr-2 h-4 w-4" /> New Invoice
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Unpaid</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalUnpaid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPaidToday)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
          <TabsTrigger value="partial">Partial</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="refunded">Refunded</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : invoices?.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                  <Receipt className="mb-2 h-8 w-8" />
                  <p>No invoices found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Invoice</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Customer</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</th>
                        <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices?.map((inv: Invoice) => (
                        <tr
                          key={inv.id}
                          className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                          onClick={() => navigate(`/billing/${inv.id}`)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/billing/${inv.id}`); } }}
                          tabIndex={0}
                          role="link"
                        >
                          <td className="px-4 py-3 text-sm font-medium">{inv.invoice_number}</td>
                          <td className="px-4 py-3 text-sm">{inv.customer_name || "Walk-in"}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date(inv.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium">
                            {formatCurrency(Number(inv.total))}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusBadgeVariant(inv.status)}>
                              {statusLabel(inv.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteInvoice(inv); }}
                              className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                              title="Void invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={confirmDeleteInvoice !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteInvoice(null); }}
        title="Void Invoice"
        description={`Void invoice ${confirmDeleteInvoice?.invoice_number} (${formatCurrency(Number(confirmDeleteInvoice?.total ?? 0))})?`}
        consequence="The invoice will be marked as refunded/voided. This cannot be undone. Customer balance will be adjusted."
        entity={`Invoice: ${confirmDeleteInvoice?.invoice_number ?? ""}`}
        confirmLabel="Void Invoice"
        onConfirm={() => {
          if (!confirmDeleteInvoice) return;
          deleteInvoice.mutate(confirmDeleteInvoice.id, {
            onSuccess: () => {
              showSuccess(`Invoice ${confirmDeleteInvoice.invoice_number} voided`);
              setConfirmDeleteInvoice(null);
            },
            onError: (err) => showError((err as Error)?.message || "Failed to void invoice"),
          });
        }}
        isPending={deleteInvoice.isPending}
      />
    </div>
  );
}

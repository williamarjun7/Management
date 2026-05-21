import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Invoice, InvoiceItem, PaymentLog, BillSplit } from "../../types";

interface PrintInvoiceProps {
  invoice: Invoice;
  splits?: BillSplit[];
  onClose: () => void;
}

export function PrintInvoice({ invoice, splits, onClose }: PrintInvoiceProps) {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const paidAmount = invoice.payment_logs?.reduce((s: number, p: PaymentLog) => s + Number(p.amount), 0) ?? 0;
  const remaining = Number(invoice.total) - paidAmount;

  const companyName = "Highlands Cafe & Motel Inn";
  const companyAddress = "123 Hill Station Road, Mountain View";
  const companyPhone = "+1 (555) 123-4567";

  return (
    <>
      <div className="fixed inset-0 z-50 bg-white print:relative print:inset-auto print:z-auto">
        <div className="flex items-center justify-between border-b p-4 print:hidden">
          <h2 className="text-lg font-semibold">Print Preview</h2>
          <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={printRef} className="invoice-print p-8 print:p-0">
          <style>{`
            @media print {
              @page { margin: 10mm; }
              body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
              .invoice-print { max-width: 80mm; margin: 0 auto; }
              .no-print { display: none !important; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 4px 2px; text-align: left; font-size: 11px; }
              th { border-bottom: 1px dashed #000; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-bold { font-weight: bold; }
              .border-t { border-top: 1px dashed #000; }
              .border-b { border-bottom: 1px dashed #000; }
              .mt-2 { margin-top: 8px; }
              .mt-4 { margin-top: 16px; }
              .mb-2 { margin-bottom: 8px; }
              .mb-4 { margin-bottom: 16px; }
              .pt-2 { padding-top: 8px; }
              .pb-2 { padding-bottom: 8px; }
              .space-y-1 > * + * { margin-top: 4px; }
              .text-xs { font-size: 10px; }
              .text-sm { font-size: 11px; }
              .text-lg { font-size: 14px; }
            }
          `}</style>

          <div className="text-center mb-4">
            <h1 className="text-lg font-bold">{companyName}</h1>
            <p className="text-xs">{companyAddress}</p>
            <p className="text-xs">{companyPhone}</p>
            <hr className="my-2 border-t border-dashed" />
          </div>

          <div className="mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="font-bold">INVOICE</span>
              <span className="font-bold">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Date:</span>
              <span>{new Date(invoice.created_at).toLocaleDateString()}</span>
            </div>
            {invoice.customer_name && (
              <div className="flex justify-between text-xs">
                <span>Customer:</span>
                <span>{invoice.customer_name}</span>
              </div>
            )}
          </div>

          <table>
            <thead>
              <tr>
                <th className="text-left">Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.invoice_items?.map((item: InvoiceItem) => (
                <tr key={item.id}>
                  <td className="text-xs">{item.description}</td>
                  <td className="text-right text-xs">{item.quantity}</td>
                  <td className="text-right text-xs">Rs. {Number(item.unit_price).toFixed(2)}</td>
                  <td className="text-right text-xs">Rs. {Number(item.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t pt-2 text-sm">
            <div className="flex justify-between text-xs">
              <span>Subtotal</span>
              <span>Rs. {Number(invoice.subtotal).toFixed(2)}</span>
            </div>

            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-xs">
                <span>Discount</span>
                <span>-Rs. {Number(invoice.discount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Total</span>
              <span>Rs. {Number(invoice.total).toFixed(2)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="flex justify-between text-xs">
                <span>Paid</span>
                <span>Rs. {paidAmount.toFixed(2)}</span>
              </div>
            )}
            {remaining > 0 && (
              <div className="flex justify-between text-xs">
                <span>Balance Due</span>
                <span>Rs. {remaining.toFixed(2)}</span>
              </div>
            )}
          </div>

          {invoice.payment_logs && invoice.payment_logs.length > 0 && (
            <div className="mt-4 space-y-1 text-xs">
              <p className="font-bold">Payments:</p>
              {invoice.payment_logs.map((log: PaymentLog) => (
                <div key={log.id} className="flex justify-between">
                  <span>{log.method} {log.reference && `(${log.reference})`}</span>
                  <span>Rs. {Number(log.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {splits && splits.length > 0 && (
            <>
              <hr className="my-4 border-t border-dashed" />
              <div className="mt-2 space-y-3">
                <p className="text-center text-sm font-bold">SPLIT BILL DETAILS</p>
                {splits.map((split, si) => {
                  const splitPaid = (split.split_payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
                  return (
                    <div key={split.id} className="space-y-1 border-t border-dashed pt-2">
                      <p className="text-xs font-bold">{si + 1}. {split.guest_name}</p>
                      {split.split_items && split.split_items.length > 0 && (
                        <div className="pl-2">
                          {split.split_items.map(item => (
                            <div key={item.id} className="flex justify-between text-[10px]">
                              <span>{item.item_name} x{item.quantity}</span>
                              <span>Rs. {Number(item.total_price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between text-xs font-bold">
                        <span>Total</span>
                        <span>Rs. {Number(split.total_amount).toFixed(2)}</span>
                      </div>
                      {splitPaid > 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span>Paid</span>
                          <span>Rs. {splitPaid.toFixed(2)}</span>
                        </div>
                      )}
                      {(split.split_payments ?? []).length > 0 && (
                        <div className="pl-2 space-y-0.5">
                          {(split.split_payments ?? []).map(p => (
                            <div key={p.id} className="flex justify-between text-[10px]">
                              <span>{p.payment_method}{p.transaction_reference ? ` (${p.transaction_reference})` : ''}</span>
                              <span>Rs. {Number(p.amount).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-center mt-1">
                        <span className={split.payment_status === 'paid' ? 'font-bold' : ''}>
                          {split.payment_status === 'paid' ? 'PAID' : split.payment_status === 'partially_paid' ? 'PARTIALLY PAID' : 'UNPAID'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <hr className="my-4 border-t border-dashed" />
          <p className="text-center text-xs">Thank you for your business!</p>
          <p className="text-center text-xs">Highlands Cafe & Motel Inn</p>
        </div>
      </div>
    </>
  );
}

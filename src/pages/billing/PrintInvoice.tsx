import { useEffect } from "react";
import type { Invoice, InvoiceItem, PaymentLog } from "../../types";
import logoSrc from "../../assets/logo.png";
import reviewQrSrc from "../../assets/review.png";

interface PrintInvoiceProps {
  invoice: Invoice;
  onClose: () => void;
  printWindow?: Window | null;
  tableNumber?: number | null;
  orderNumber?: string | null;
  paperWidth?: string;
  businessName?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const METHOD_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", upi: "UPI", credit_account: "Credit", fonepay: "FonePay",
};

function fmt(n: number): string {
  return n.toFixed(2);
}

export function PrintInvoice({ invoice, onClose, printWindow, tableNumber, orderNumber, paperWidth = "80mm", businessName = "Highlands Cafe & Motel Inn" }: PrintInvoiceProps) {
  useEffect(() => {
    const logoUrl = new URL(logoSrc, window.location.origin).href;
    const qrUrl = new URL(reviewQrSrc, window.location.origin).href;

    const paidLogs = invoice.payment_logs?.filter((p: PaymentLog) => p.status === "paid") ?? [];
    const paidAmount = paidLogs.reduce((s: number, p: PaymentLog) => s + Number(p.amount), 0);
    const subtotal = Number(invoice.subtotal);
    const discount = Number(invoice.discount);
    const tax = Number(invoice.tax);
    const serviceCharge = Number(invoice.service_charge);
    const total = Number(invoice.total);
    const totalItemDiscounts = invoice.invoice_items?.reduce((s, i) => s + Number(i.discount), 0) ?? 0;
    const totalDiscount = discount + totalItemDiscounts;
    const change = paidAmount > total ? paidAmount - total : 0;
    const remaining = paidAmount > total ? 0 : total - paidAmount;
    const isCredit = invoice.status === "credit" || invoice.status === "partially_paid";

    const d = new Date(invoice.created_at);
    const dateStr = `${d.getDate().toString().padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

    function itemRows(): string {
      if (!invoice.invoice_items || invoice.invoice_items.length === 0) return "";
      const rows = invoice.invoice_items.map((item: InvoiceItem) => {
        const id = Number(item.discount);
        const it = Number(item.total);
        let html = `<div class="item-name">${esc(item.description)}</div>`;
        if (id > 0) {
          html += `<div class="xs r" style="color:#666">Discount: -${fmt(id)}</div>`;
        }
        html += `<div class="item-line"><span>${item.quantity} x ${fmt(Number(item.unit_price))}</span><span>${fmt(it)}</span></div>`;
        return `<div class="mb1">${html}</div>`;
      }).join("");
      return `<hr /><div class="mb2">${rows}</div><hr />`;
    }

    function totalsHtml(): string {
      let html = `<div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>`;
      if (totalDiscount > 0) {
        html += `<div class="row"><span>Discount</span><span>-${fmt(totalDiscount)}</span></div>`;
      }
      if (tax > 0) {
        html += `<div class="row"><span>Tax${invoice.tax_rate > 0 ? ` (${fmt(invoice.tax_rate)}%)` : ""}</span><span>${fmt(tax)}</span></div>`;
      }
      if (serviceCharge > 0) {
        html += `<div class="row"><span>Service Charge${invoice.service_charge_rate > 0 ? ` (${fmt(invoice.service_charge_rate)}%)` : ""}</span><span>${fmt(serviceCharge)}</span></div>`;
      }
      html += `<hr class="thick" /><div class="row grand-total"><span>GRAND TOTAL</span><span>${fmt(total)}</span></div>`;
      if (paidAmount > 0) {
        html += `<div class="row mt1"><span>Paid</span><span>${fmt(paidAmount)}</span></div>`;
      }
      if (change > 0) {
        html += `<div class="row"><span>Change</span><span>${fmt(change)}</span></div>`;
      } else if (remaining > 0) {
        const label = isCredit && paidAmount === 0 ? "Due" : "Remaining";
        html += `<div class="row"><span>${label}</span><span>${fmt(remaining)}</span></div>`;
      }
      return `<div class="mb2 totals">${html}</div>`;
    }

    function paymentHtml(): string {
      if (paidLogs.length === 0) return "";
      const rows = paidLogs.map((log: PaymentLog) =>
        `<div class="row"><span>${METHOD_LABEL[log.method] || log.method}</span><span>${fmt(Number(log.amount))}</span></div>`
      ).join("");
      return `<hr /><div class="mb2 totals"><div class="b mb1">Payment Method</div>${rows}</div>`;
    }

    const hasItems = invoice.invoice_items && invoice.invoice_items.length > 0;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Invoice ${esc(invoice.invoice_number)}</title>
<style>
  @page { margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 10px; line-height: 1.3; color: #000; background: #fff; }
  .receipt { max-width: ${paperWidth}; margin: 0 auto; padding: 4mm 3mm; }
  hr { border: none; border-top: 1px dashed #888; margin: 4px 0; }
  hr.thick { border-top: 1px solid #333; margin: 4px 0; }
  .c { text-align: center; }
  .r { text-align: right; }
  .b { font-weight: bold; }
  .xs { font-size: 8px; }
  .sm { font-size: 9px; }
  .row { display: flex; justify-content: space-between; }
  .mt1 { margin-top: 2px; }
  .mb1 { margin-bottom: 2px; }
  .mb2 { margin-bottom: 4px; }
  .item-name { font-size: 9px; overflow-wrap: break-word; word-break: break-word; }
  .item-line { font-size: 9px; display: flex; justify-content: space-between; }
  .totals { font-size: 9px; }
  .grand-total { font-size: 12px; font-weight: bold; }
  img.logo { height: 40px; width: 40px; object-fit: contain; display: block; margin: 0 auto 2px; }
  img.qr { height: 80px; width: 80px; object-fit: contain; display: block; margin: 0 auto 2px; }
</style>
</head>
<body>
<div class="receipt">
  <div class="c mb2">
    <img src="${logoUrl}" alt="" class="logo" />
    <div class="b" style="font-size:12px">${businessName}</div>
    <div class="sm">Birendranagar-8, Khajura</div>
    <div class="sm">Surkhet, Nepal</div>
    <div class="sm">+977 9763215874</div>
  </div>

  <hr />

  <div class="mb2 sm">
    <div class="row"><span>Invoice No</span><span class="b">${esc(invoice.invoice_number)}</span></div>
    <div class="row"><span>Date</span><span>${dateStr}</span></div>
    <div class="row"><span>Time</span><span>${timeStr}</span></div>
    ${tableNumber != null ? `<div class="row"><span>Table</span><span>${tableNumber}</span></div>` : ""}
    ${orderNumber ? `<div class="row"><span>Order No</span><span>${esc(orderNumber)}</span></div>` : ""}
  </div>

    ${isCredit ? `<div class="c mb2" style="font-size:11px;font-weight:bold;color:#d97706">*** CREDIT SALE ***</div>` : ""}
    ${invoice.customer_name ? `<div class="mb2 sm"><div class="row"><span>Customer</span><span>${esc(invoice.customer_name)}</span></div></div>` : ""}

    ${hasItems ? `<div class="b sm mb1">Item</div>` : ""}
    ${itemRows()}

  ${totalsHtml()}

  ${paymentHtml()}

  <hr />

  <div class="c sm mb2">
    <div class="b">Thank you for visiting!</div>
    <div class="xs">We hope to see you again.</div>
  </div>

  <div class="c mb2">
    <img src="${qrUrl}" alt="" class="qr" />
    <div class="sm mb1" style="letter-spacing:2px">★★★★★</div>
    <div class="xs b">Loved your experience?</div>
    <div class="xs">Scan the QR code and leave us a Google Review.</div>
    <div class="xs mt1">Your feedback helps us improve</div>
    <div class="xs">and supports our local business.</div>
  </div>

  <hr />

  <div class="c xs">${businessName}</div>
</div>
</body>
</html>`;

    const pw = printWindow;
    if (!pw || pw.closed) {
      onClose();
      return;
    }

    pw.document.write(html);
    pw.document.close();

    pw.onafterprint = () => {
      pw.close();
      onClose();
    };

    const poll = setInterval(() => {
      const imgs = pw.document.images;
      const ready = imgs.length === 0 || Array.from(imgs).every((img) => img.complete);
      if (ready) {
        clearInterval(poll);
        clearTimeout(safety);
        pw.focus();
        setTimeout(() => {
          pw.print();
        }, 150);
      }
    }, 100);

    const safety = setTimeout(() => {
      clearInterval(poll);
      pw.focus();
      pw.print();
    }, 5000);

    return () => {
      clearInterval(poll);
      clearTimeout(safety);
      pw.onafterprint = null;
      if (!pw.closed) pw.close();
    };
  }, []);

  return null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

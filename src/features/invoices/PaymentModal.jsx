import { useEffect, useMemo, useState } from "react";
import {
  adaptiveUpsert,
  createId,
  formatCurrency,
  formatDate,
} from "./invoiceUtils";

const METHODS = [
  "Cash",
  "Check",
  "Credit Card",
  "ACH",
  "Wire",
  "Zelle",
  "Venmo",
  "Other",
];

function today() {
  return new Date().toISOString().slice(0,10);
}

export default function PaymentModal({
  supabase,
  invoice,
  totals,
  onClose,
  onSaved,
}) {
  const balance = useMemo(
    ()=>Math.max(0, Number(totals?.balanceDue||0)),
    [totals]
  );

  const [payment,setPayment]=useState({
    id:createId(),
    invoice_id:invoice?.id||"",
    payment_date:today(),
    amount:balance,
    method:"Check",
    reference_number:"",
    notes:"",
  });

  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    setPayment(p=>({
      ...p,
      invoice_id:invoice?.id||"",
      amount:balance,
    }));
  },[invoice,balance]);

  async function save(e){
    e.preventDefault();
    if(!supabase) return setError("Supabase unavailable.");
    if(Number(payment.amount)<=0){
      return setError("Payment amount must be greater than zero.");
    }

    setSaving(true);
    setError("");

    try{
      const result=await adaptiveUpsert(
        supabase,
        "invoice_payments",
        {
          ...payment,
          amount:Number(payment.amount),
          created_at:new Date().toISOString(),
          updated_at:new Date().toISOString(),
        }
      );

      if(result.error) throw result.error;

      onSaved?.(result.data||payment);
    }catch(err){
      console.error(err);
      setError(err.message||"Unable to save payment.");
    }finally{
      setSaving(false);
    }
  }

  return (
    <div className="payment-modal-overlay">
      <form className="payment-modal" onSubmit={save}>
        <header>
          <h2>Record Payment</h2>
          <p>
            Invoice <strong>{invoice?.invoice_number}</strong>
          </p>
        </header>

        {error && <div className="invoice-error-banner">{error}</div>}

        <section className="payment-summary">
          <div><span>Invoice Total</span><strong>{formatCurrency(totals?.invoiceTotal||0)}</strong></div>
          <div><span>Paid</span><strong>{formatCurrency(totals?.creditsTotal||0)}</strong></div>
          <div><span>Balance Due</span><strong>{formatCurrency(balance)}</strong></div>
        </section>

        <section className="payment-grid">
          <label>
            Payment Date
            <input
              type="date"
              value={payment.payment_date}
              onChange={e=>setPayment({...payment,payment_date:e.target.value})}
            />
          </label>

          <label>
            Amount
            <input
              type="number"
              step="0.01"
              min="0"
              value={payment.amount}
              onChange={e=>setPayment({...payment,amount:e.target.value})}
            />
          </label>

          <label>
            Method
            <select
              value={payment.method}
              onChange={e=>setPayment({...payment,method:e.target.value})}
            >
              {METHODS.map(m=><option key={m}>{m}</option>)}
            </select>
          </label>

          <label>
            Reference #
            <input
              value={payment.reference_number}
              onChange={e=>setPayment({...payment,reference_number:e.target.value})}
            />
          </label>

          <label className="payment-wide">
            Notes
            <textarea
              rows={5}
              value={payment.notes}
              onChange={e=>setPayment({...payment,notes:e.target.value})}
            />
          </label>
        </section>

        <section className="payment-preview">
          <h3>Preview</h3>
          <div><span>Date</span><strong>{formatDate(payment.payment_date)}</strong></div>
          <div><span>Method</span><strong>{payment.method}</strong></div>
          <div><span>Amount</span><strong>{formatCurrency(payment.amount)}</strong></div>
          <div><span>Remaining Balance</span><strong>{formatCurrency(Math.max(0,balance-Number(payment.amount||0)))}</strong></div>
        </section>

        <footer className="payment-footer">
          <button type="button" onClick={()=>onClose?.()}>
            Cancel
          </button>

          <button type="submit" disabled={saving}>
            {saving?"Saving...":"Save Payment"}
          </button>
        </footer>
      </form>
    </div>
  );
}
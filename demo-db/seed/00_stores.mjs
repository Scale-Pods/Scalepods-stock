// The real product keeps the sheet-based screens (payments, orders, mail tracker) in stored copies that are rebuilt from Google Sheets once a day.
// The demo has no sheets, so each stored copy becomes a plain table with the same columns, and the dummy data is written into it directly.
const STORES = ["order_lines", "orders", "sales_invoices", "purchase_invoices", "expenses", "receivables", "payables", "gpay_payments", "petty_expenses", "brokerage", "pay_summary", "vehicle_register", "mail_inbox", "quotations", "leads", "mail_clients"];

export default async function (db) {
  for (const s of STORES) {
    const store = `app.v_${s}_store`;
    await db.exec(`
      create table app.v_${s}_tmp as select * from ${store} with no data;
      drop materialized view ${store} cascade;
      alter table app.v_${s}_tmp rename to v_${s}_store;
      create view public.v_${s} with (security_invoker = true) as select * from app.v_${s}_store where (select app.is_admin());
      grant select on app.v_${s}_store to authenticated;
      grant select on public.v_${s} to authenticated;
    `);
  }
  // "days late" is worked out when the page is read, not frozen when the data was built
  await db.exec(`
    create or replace view public.v_receivables with (security_invoker = true) as
      select entity, row_no, kind, salesperson, po_no, invoice_no, invoice_date, credit_days, due_date, party, amount, received, pending, greatest(0, current_date - due_date)::int as overdue_days
      from app.v_receivables_store where (select app.is_admin());
    create or replace view public.v_payables with (security_invoker = true) as
      select entity, row_no, checked, invoice_no, invoice_date, file_url, buyer, purchased_for, credit_days, due_date, broker, vendor, amount, advance, tds, pending, remark, greatest(0, current_date - due_date)::int as overdue_days
      from app.v_payables_store where (select app.is_admin());
  `);
  await db.exec(`create or replace function app.refresh_sheet_stores() returns void language sql as $$ select 1 $$;`);
}

import Link from "next/link";
import type { Metadata } from "next";
import { PublicPage, H2, P, CONTACT } from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "ScalePods Stock · Stock and operations for Northwind Pipes & Fittings",
  description: "ScalePods Stock is the private stock and operations system of Northwind Pipes & Fittings and Bluecrest Steel & Engineering: plates, stock counts, certificates, documents, orders and payments.",
  robots: { index: true, follow: true },
};

const FEATURES: [string, string][] = [
  ["Every plate, accounted for", "A checked stock book of every steel plate: what came in, what went out, and what is left, by grade, thickness and size. The balance is always calculated from the records, never typed."],
  ["Documents read for you", "Delivery challans, mill certificates and invoices are read from a photo or PDF, checked by a person, and only then used."],
  ["Stock from the mill's dispatch mail", "When the mill emails its dispatch details, the app reads the table in that mail and suggests the plates to add to stock. A person approves it before anything changes."],
  ["Mail inside the app", "The company's mailbox shown next to its orders and leads. The AI can summarise a mail, and draft a reply for a person to read, change and send. Nothing is sent without a person pressing Send."],
  ["Orders, invoices and payments", "Who owes us, whom we owe, and which orders are open, read from the company's payment sheets."],
  ["Ask in plain words", "A built-in assistant answers questions such as “Do we have 12 mm SA 516 Gr 70, 1500 × 6000?” from the company's own records and shows where each answer came from."],
];

export default function Welcome() {
  return (
    <PublicPage>
      <section>
        <div className="mb-4 h-1.5 w-14 rounded-full bg-accent" />
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[3rem]">ScalePods Stock</h1>
        <p className="mt-4 max-w-2xl text-[1.1rem] leading-relaxed text-muted">The stock and operations system of Northwind Pipes &amp; Fittings and Bluecrest Steel &amp; Engineering, authorised dealers and stockists of steel plates. It keeps stock, documents, orders and payments in one place, for the company&apos;s own staff.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-lg bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark">Sign in</Link>
        </div>
        <p className="mt-3 text-[0.88rem] text-muted">Access is by invitation: staff sign in with the email and password given to them by the office.</p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-lg border border-line bg-card p-5">
            <h2 className="font-display text-[1.05rem] font-bold">{t}</h2>
            <p className="mt-1.5 text-[0.93rem] leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </section>

      <section>
        <H2>Contact</H2>
      </section>
    </PublicPage>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { DEFAULT_DEMO_USER, DEMO_USERS } from "@/lib/demoAuth";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState<string>(DEFAULT_DEMO_USER.email);
  const field = "mt-1.5 w-full rounded-md border border-line bg-field px-4 py-3 text-[1rem] focus:border-brand";
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-muted">Email</span>
        <input name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-muted">Password</span>
        <div className="relative">
          <input name="password" type={show ? "text" : "password"} autoComplete="current-password" required defaultValue="demo1234" className={field + " pr-12"} />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            title={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 mt-[0.1rem] -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-surface hover:text-ink"
          >
            {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-[0.9rem] text-bad">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-ink py-3.5 text-[1rem] font-semibold text-surface transition-colors hover:bg-accent hover:text-white disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <div className="rounded-lg border border-line bg-surface/60 p-3.5">
        <p className="text-[0.82rem] font-semibold text-ink">Demo accounts <span className="font-normal text-muted">· any password works</span></p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DEMO_USERS.map((u) => (
            <button key={u.id} type="button" onClick={() => setEmail(u.email)} title={u.email}
              className={"rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors " + (email === u.email ? "border-brand bg-brand-soft text-brand" : "border-line bg-card text-muted hover:border-brand hover:text-ink")}>{u.label}</button>
          ))}
        </div>
        <p className="mt-2 text-[0.76rem] text-muted">Each account sees what that role sees in the real product. Everything here is dummy data.</p>
      </div>
    </form>
  );
}

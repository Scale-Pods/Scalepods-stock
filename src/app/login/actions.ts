"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_COOKIE, DEMO_USERS } from "@/lib/demoAuth";

export type LoginState = { error?: string };

/** The demo sign-in: any password works for one of the demo people. The sign-in page shows their addresses. */
export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const me = DEMO_USERS.find((u) => u.email === email);
  if (!me) return { error: "That email is not one of the demo accounts. Pick one below." };
  (await cookies()).set(DEMO_COOKIE, me.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 12, path: "/" });
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(DEMO_COOKIE);
  redirect("/login");
}

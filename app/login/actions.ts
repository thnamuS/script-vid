"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };
export async function authenticate(
  _previous: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");
  const signup = form.get("mode") === "signup";
  if (!email || !password || email.length > 254 || password.length > 256)
    return { error: "Enter a valid email and password." };
  if (signup && password.length < 8)
    return { error: "Use a password with at least 8 characters." };
  let loggedIn = false;
  try {
    const client = await createClient();
    if (signup) {
      const origin = (await headers()).get("origin");
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) return { error: error.message };
      if (!data.session)
        return {
          message: "Check your email to confirm your account, then sign in.",
        };
      loggedIn = true;
    } else {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error: error.message };
      loggedIn = true;
    }
  } catch {
    return {
      error:
        "Unable to connect to authentication. Check your Supabase environment variables and try again.",
    };
  }
  if (loggedIn) redirect("/");
  return {};
}
export async function signOut() {
  const client = await createClient();
  const { error } = await client.auth.signOut();
  if (error) throw Error("Unable to sign out. Please try again.");
  redirect("/login");
}

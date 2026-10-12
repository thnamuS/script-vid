"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { authenticate } from "./actions";
import {
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/dashboard-shell";

function LoginForm() {
  const [signup, setSignup] = useState(false);
  const [state, action, pending] = useActionState(authenticate, {});
  const params = useSearchParams();
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section
        className="panel w-full max-w-md p-7 sm:p-9"
        aria-labelledby="login-title"
      >
        <h1 id="login-title" className="text-2xl font-semibold tracking-tight">
          {signup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Sign in to your private news and script workspace.
        </p>
        <form action={action} className="mt-7 space-y-5">
          <input
            type="hidden"
            name="mode"
            value={signup ? "signup" : "login"}
          />
          <div>
            <label htmlFor="email" className="mb-2 block text-xs font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-xs font-medium"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={signup ? 8 : undefined}
              maxLength={256}
              className={inputClass}
            />
            {signup && (
              <p className="mt-2 text-xs text-slate-500">
                At least 8 characters.
              </p>
            )}
          </div>
          {(state.error || params.get("error")) && (
            <p role="alert" className="text-sm text-red-700">
              {state.error ||
                "The confirmation link could not be verified. Try signing in or request a new confirmation email."}
            </p>
          )}
          {state.message && (
            <p role="status" className="text-sm text-primary">
              {state.message}
            </p>
          )}
          <button
            disabled={pending}
            className={`${buttonClass} w-full`}
            type="submit"
          >
            {pending ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          disabled={pending}
          onClick={() => setSignup(!signup)}
          className={`${secondaryClass} mt-3 w-full`}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

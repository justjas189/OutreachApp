"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div>
        <label className="mb-2 block text-sm font-bold" htmlFor="email">
          Admin email
        </label>
        <input
          autoComplete="email"
          className="field"
          id="email"
          name="email"
          placeholder="admin@example.com"
          required
          type="email"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-bold" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="field"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pendingLabel="Checking access…">Sign in</SubmitButton>
    </form>
  );
}

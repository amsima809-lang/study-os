import type { ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-white shadow px-4 py-3">{children}</div>;
}

export function Loading({ children }: { children: ReactNode }) {
  return <p className="text-slate-400 text-sm text-center py-8">{children}</p>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 text-center">
      {children}
    </div>
  );
}

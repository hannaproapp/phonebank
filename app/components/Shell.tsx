import Link from "next/link";

export function Shell({
  title,
  back,
  right,
  children,
}: {
  title: string;
  back?: { href: string; label: string };
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-5">
      <header className="mb-5">
        {back && (
          <Link href={back.href} className="text-sm font-medium text-blue-700">
            ← {back.label}
          </Link>
        )}
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{title}</h1>
          <div className="flex items-center gap-2">{right}</div>
        </div>
      </header>
      {children}
      <footer className="mt-12 text-center text-xs text-slate-400">
        <Link href="/logout">Sign out</Link>
      </footer>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="label block">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

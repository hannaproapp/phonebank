import { requestLink } from "./actions";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; err?: string; link?: string; used?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-2xl font-bold">Phone Bank</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the email your campaign added you with. We&apos;ll send you a link.
      </p>

      <form action={requestLink} className="card mt-6 space-y-3 p-5">
        <label className="label block">Email</label>
        <input
          className="input"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <button className="btn btn-primary btn-lg" type="submit">
          Send me my link
        </button>
      </form>

      {sp.sent === "1" && (
        <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Check your email for the link.
        </p>
      )}
      {sp.link && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Email is not configured on this install.</p>
          <p className="mt-1 break-all">{sp.link}</p>
        </div>
      )}
      {sp.used === "1" && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          That link has already been used or has expired. Links work once. Enter your email
          above to get a fresh one.
        </p>
      )}
      {sp.err && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          No account with that email. Ask your campaign admin to add you.
        </p>
      )}
    </main>
  );
}

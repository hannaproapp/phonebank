import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  if (user.is_super) redirect("/admin");

  const admin = await q(
    `select campaign_id from campaign_members where user_id = $1 and role = 'admin' limit 1`,
    [user.id],
  );
  if (admin.length) redirect("/admin");

  redirect("/call");
}

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDebugAdmin } from "@/lib/debug-agent";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin | Build_Core", robots: { index: false, follow: false } };

// Every page under /admin: only people in ADMIN_EMAILS get in (everybody else sees a 404).
// The /api/admin/* routes check the same rule again, so hiding the page is never the only protection.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (!isDebugAdmin(session.user.email)) notFound();
  return (
    <div className="min-h-screen bg-[#090D16] text-white lg:flex lg:items-start">
      <AdminNav email={session.user.email as string} />
      <div className="min-w-0 flex-1 p-4 sm:p-6">{children}</div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getEventViewerAccess } from "@/lib/event-view-access";

export default async function EventAccessLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}>) {
  const session = await requireSession();
  const { eventId } = await params;
  const access = await getEventViewerAccess(session.userId, eventId);
  if (!access.event || !access.canView) notFound();
  return children;
}

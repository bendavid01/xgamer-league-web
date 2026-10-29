import { permanentRedirect } from "next/navigation";

/** Merged into the Tournaments hub. */
export default async function Moved({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  permanentRedirect(
    `/tournaments?${t ? `t=${encodeURIComponent(t)}&` : ""}tab=players`,
  );
}

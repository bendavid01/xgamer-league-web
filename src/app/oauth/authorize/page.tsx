import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageTitle } from "@/components/LeagueUI";
import {
  approve,
  checkAuthorize,
  deny,
  mcpEnabled,
  OAuthError,
} from "@/lib/oauth";
import { HttpError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect Claude to OM", robots: "noindex" };

type Params = Record<string, string | undefined>;
const PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
];

/** Keeps only the OAuth parameters (single values) from a query string or form. */
function pick(
  get: (k: string) => string | string[] | undefined | null,
): Params {
  const out: Params = {};
  for (const k of PARAMS) {
    const v = get(k);
    if (typeof v === "string" && v.length <= 2000) out[k] = v;
  }
  return out;
}
const query = (p: Params) =>
  new URLSearchParams(
    Object.entries(p).filter((e): e is [string, string] => !!e[1]),
  ).toString();

/** Server action for Allow / Deny. Everything is validated again here; the form is not trusted. */
async function decide(form: FormData) {
  "use server";
  if (!mcpEnabled()) notFound();
  const params = pick((k) => form.get(k)?.toString());
  const checked = await checkAuthorize(params);
  if (!checked.ok) {
    if (checked.fatal) redirect("/oauth/authorize?" + query(params));
    redirect(checked.redirect);
  }
  const session = await auth();
  const id = session?.user?.id;
  if (!id)
    redirect(
      "/login?next=" + encodeURIComponent("/oauth/authorize?" + query(params)),
    );
  if (form.get("decision") !== "allow") redirect(deny(checked.request));
  let target: string;
  try {
    target = await approve(checked.request, {
      id,
      name: session.user?.name ?? undefined,
    });
  } catch (error) {
    if (error instanceof OAuthError || error instanceof HttpError)
      target = deny(checked.request);
    else throw error;
  }
  redirect(target);
}

export default async function Authorize({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!mcpEnabled()) notFound();
  const sp = await searchParams;
  const params = pick((k) => sp[k]);
  const checked = await checkAuthorize(params);
  if (!checked.ok && !checked.fatal) redirect(checked.redirect);
  if (!checked.ok)
    return (
      <div className="page-shell py-12">
        <PageTitle
          label="CLAUDE CONNECTION"
          title="This link can't be used."
          description={checked.message}
        />
        <p className="notice max-w-2xl">
          Start connecting again from Claude. If it keeps failing, the app is
          not on XGamer&apos;s allowed list.
        </p>
      </div>
    );
  const session = await auth();
  if (!session?.user?.id)
    redirect(
      "/login?next=" + encodeURIComponent("/oauth/authorize?" + query(params)),
    );
  const { client, redirectUri } = checked.request;
  const host = new URL(redirectUri).host;
  return (
    <div className="page-shell py-12">
      <PageTitle
        label="CLAUDE CONNECTION"
        title="Connect Claude to OM?"
        description={`Signed in as ${session.user.name ?? "organizer"} (Discord).`}
      />
      <div className="notice max-w-2xl space-y-3">
        <p>
          <strong>{client.name}</strong> wants read-only access to XGamer OM as
          you. It will return to <strong>{host}</strong>.
        </p>
        <p>It will be able to:</p>
        <ul className="list-disc pl-6">
          <li>See tournaments, fixtures, standings and registered players.</li>
          <li>
            See players&apos; WhatsApp numbers and draft reminder links, if your
            OM role includes registrations. Each time is recorded in the
            activity log.
          </li>
          <li>It cannot approve, edit, delete or send anything.</li>
        </ul>
        <p>
          Only allow this if <strong>you</strong> just started connecting from
          your own Claude app. If someone sent you this link, choose Deny.
        </p>
      </div>
      <form action={decide} className="mt-6 flex gap-3">
        {Object.entries(params).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button className="button-primary" name="decision" value="allow">
          Allow
        </button>
        <button className="button-secondary" name="decision" value="deny">
          Deny
        </button>
      </form>
    </div>
  );
}

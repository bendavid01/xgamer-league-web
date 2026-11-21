"use client";
import { useEffect, useRef, useState } from "react";
import { disclose, useEditSender } from "../client";
import { EVIDENCE_LABEL, METHOD_LABEL } from "../labels";
import type { ContactInfo, EditResult } from "../types";
import { Feedback } from "../ui";

/** "Contact on WhatsApp": opens the chat; the number is never placed in the page. */
export function ContactButton({
  tournament,
  playerId,
  purpose,
}: {
  tournament: string;
  playerId: string;
  purpose: string;
}) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className="om-link"
        onClick={async () => {
          setError("");
          // Opened first, so the browser doesn't block it after the request.
          const tab = window.open("about:blank", "_blank");
          const r = await disclose(tournament, playerId, purpose);
          if ("error" in r) {
            tab?.close();
            setError(r.error);
            return;
          }
          if (tab) {
            tab.opener = null;
            tab.location.href = r.waUrl;
          }
        }}
      >
        Contact on WhatsApp
      </button>
      {error && (
        <span role="alert" className="block text-xs text-amber-200">
          {error}
        </span>
      )}
    </>
  );
}

export default function WhatsAppSection({
  tournament,
  playerId,
  contact,
  admin,
  removed,
  reload,
}: {
  tournament: string;
  playerId: string;
  contact: ContactInfo;
  admin: boolean;
  removed: boolean;
  reload: () => Promise<void>;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState<{
    code: string;
    challenge: string | null;
    sendUrl: string;
    newNumber?: string;
  } | null>(null);
  const [route, setRoute] = useState(
    contact.route1Available ? "established_channel" : "independent_evidence",
  );
  const [evidence, setEvidence] = useState(
    contact.hasEfootballId ? "efootball_possession" : "known_person_live_video",
  );
  const send = useEditSender();
  const open = contact.openChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const post = async (
    form: string,
    value: Record<string, unknown>,
    done: string,
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    const r = await send(form, { tournament, ...value });
    if (r.ok) setNotice(done);
    else setError(r.error!);
    await reload();
    setBusy(false);
    return r;
  };

  return (
    <div className="space-y-3" aria-busy={busy}>
      <p className="font-semibold">WhatsApp number</p>
      <p>
        <span className="font-mono">{shown ?? contact.masked}</span>{" "}
        <ContactButton
          tournament={tournament}
          playerId={playerId}
          purpose="tournament_coordination"
        />
        {admin && !shown && (
          <button
            type="button"
            className="om-link ml-3"
            onClick={async () => {
              const r = await disclose(tournament, playerId, "admin_review");
              if ("error" in r) return setError(r.error);
              setShown(r.phone);
              timer.current = setTimeout(() => setShown(null), 30_000);
            }}
          >
            Show for 30 s
          </button>
        )}
      </p>
      <p className="text-xs text-slate-400">
        {contact.attestedAt
          ? `Organizer-attested on ${new Date(contact.attestedAt).toLocaleString("en-IN")} (${METHOD_LABEL[contact.method ?? ""] ?? contact.method}). This is a manual organizer record, not automated proof of ownership.`
          : "Legacy number: never organizer-attested. A change needs independent evidence and a second admin."}{" "}
        Every view of a full number is recorded in the activity log.
      </p>
      <Feedback error={error} notice={notice} />
      {admin && !contact.editingOn && (
        <p className="text-sm text-slate-400">
          Changing WhatsApp numbers is switched off until it&apos;s separately
          approved.
        </p>
      )}
      {started && (
        <div className="om-card space-y-2">
          <p>
            Code for the new number:{" "}
            <strong className="font-mono">{started.code}</strong>
            {started.newNumber && <> ({started.newNumber})</>}. It&apos;s shown
            only now.
          </p>
          <a
            className="button-secondary om-small w-fit"
            href={started.sendUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open WhatsApp chat with the code
          </a>
          {started.challenge && (
            <p>
              eFootball challenge:{" "}
              <strong className="font-mono">{started.challenge}</strong>. Ask
              the player to put it in the profile of their registered eFootball
              account (or a friend-request message from it), then check it
              yourself in the game.
            </p>
          )}
          <button
            type="button"
            className="om-link"
            onClick={() => setStarted(null)}
          >
            Hide
          </button>
        </div>
      )}
      {open && (
        <div className="om-card space-y-3">
          <p>
            <strong>Open change</strong> ·{" "}
            {open.route === "established_channel"
              ? "established channel"
              : `independent evidence: ${EVIDENCE_LABEL[open.evidenceType ?? ""] ?? open.evidenceType}`}{" "}
            · started by {open.requestedByName ?? "an admin"} ·{" "}
            {open.status === "pending_code"
              ? `waiting for the code (${open.attemptsLeft} attempts, ${open.resendsLeft} resends left)`
              : `waiting for a second admin until ${new Date(open.approveBy!).toLocaleString("en-IN")} (Players → WhatsApp changes)`}
          </p>
          {contact.canEdit &&
            open.status === "pending_code" &&
            open.requestedByMe && (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const efootball =
                    open.evidenceType === "efootball_possession";
                  void post(
                    `code-${open.id}`,
                    {
                      action: "contact.change_code",
                      changeId: open.id,
                      code: String(f.get("code") ?? ""),
                      attest: f.get("attest") === "on",
                      ...(efootball
                        ? {
                            efootballId: String(f.get("efootballId") ?? ""),
                            challenge: String(f.get("challenge") ?? ""),
                          }
                        : {}),
                    },
                    open.route === "established_channel"
                      ? "WhatsApp number changed."
                      : "Code accepted. A second main admin must now approve.",
                  ).then((r) => r.ok && setStarted(null));
                }}
              >
                <input
                  name="code"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="6-digit code"
                  className="control-input !mt-0 font-mono w-40"
                  aria-label="Code returned by the player"
                />
                {open.evidenceType === "efootball_possession" && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      name="efootballId"
                      required
                      placeholder="eFootball ID you checked"
                      className="control-input !mt-0 font-mono uppercase"
                      aria-label="eFootball ID you checked"
                    />
                    <input
                      name="challenge"
                      required
                      maxLength={6}
                      placeholder="Challenge you saw on it"
                      className="control-input !mt-0 font-mono uppercase"
                      aria-label="Challenge you saw on the eFootball account"
                    />
                  </div>
                )}
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="attest" required />
                  {open.route === "established_channel"
                    ? "I attest the code came back from the player's current, organizer-attested WhatsApp number."
                    : "I attest the player sent this code back from the new number."}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="button-primary om-small">
                    Check code
                  </button>
                  <button
                    type="button"
                    className="button-secondary om-small"
                    onClick={async () => {
                      const r = await post(
                        `resend-${open.id}`,
                        { action: "contact.change_resend", changeId: open.id },
                        "New code ready. The old code no longer works.",
                      );
                      if (r.ok && r.data)
                        setStarted({
                          code: String(r.data.code),
                          challenge: null,
                          sendUrl: String(r.data.sendUrl),
                        });
                    }}
                  >
                    Send a new code
                  </button>
                </div>
              </form>
            )}
          {contact.canEdit && (
            <CloseContactChange
              onClose={(reason) =>
                post(
                  `cancel-${open.id}`,
                  {
                    action: "contact.change_cancel",
                    changeId: open.id,
                    reason,
                  },
                  "Number change cancelled.",
                )
              }
            />
          )}
        </div>
      )}
      {contact.canEdit && !open && !removed && (
        <details className="om-card">
          <summary className="cursor-pointer">Change WhatsApp number</summary>
          <form
            className="space-y-3 mt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const independent = route === "independent_evidence";
              const seen = String(f.get("observedAt") ?? "");
              void post(
                "start",
                {
                  action: "contact.change_start",
                  playerId,
                  expectedContactVersion: contact.version,
                  newPhone: String(f.get("newPhone") ?? ""),
                  route,
                  ...(independent
                    ? {
                        evidenceType: evidence,
                        evidenceNote: String(f.get("evidenceNote") ?? ""),
                        ...(evidence !== "efootball_possession" && seen
                          ? { evidenceObservedAt: new Date(seen).toISOString() }
                          : {}),
                      }
                    : {}),
                  reason: String(f.get("reason") ?? ""),
                  confirm: f.get("confirm") === "on",
                },
                "Change started. Send the code to the new number.",
              ).then((r) => {
                if (r.ok && r.data)
                  setStarted({
                    code: String(r.data.code),
                    challenge: (r.data.challenge as string | null) ?? null,
                    sendUrl: String(r.data.sendUrl),
                    newNumber: String(r.data.newNumber),
                  });
              });
            }}
          >
            <fieldset className="space-y-1">
              <legend className="text-sm font-semibold">
                How is the player identified?
              </legend>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="route"
                  checked={route === "established_channel"}
                  disabled={!contact.route1Available}
                  onChange={() => setRoute("established_channel")}
                />
                Established channel (one admin): the code comes back from the
                current, organizer-attested number
                {!contact.route1Available && " (not available: legacy number)"}
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="radio"
                  name="route"
                  checked={route === "independent_evidence"}
                  onChange={() => setRoute("independent_evidence")}
                />
                Independent evidence (needs a second main admin)
              </label>
            </fieldset>
            <input
              name="newPhone"
              required
              maxLength={32}
              placeholder="New WhatsApp number (+44 7911 123456, or 10 digits for India)"
              className="control-input !mt-0"
              aria-label="New WhatsApp number"
            />
            {route === "independent_evidence" && (
              <div className="space-y-2">
                <select
                  className="control-input !mt-0"
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                  aria-label="Evidence type"
                >
                  {Object.entries(EVIDENCE_LABEL).map(([key, text]) => (
                    <option
                      key={key}
                      value={key}
                      disabled={
                        key === "efootball_possession" &&
                        !contact.hasEfootballId
                      }
                    >
                      {text}
                      {key === "efootball_possession" && !contact.hasEfootballId
                        ? " (no eFootball ID on record)"
                        : ""}
                    </option>
                  ))}
                </select>
                {evidence !== "efootball_possession" && (
                  <input
                    type="datetime-local"
                    name="observedAt"
                    required
                    className="control-input !mt-0"
                    aria-label="When you saw the player"
                  />
                )}
                <textarea
                  name="evidenceNote"
                  required
                  minLength={20}
                  maxLength={500}
                  placeholder="What you checked, when and who did it. No phone numbers."
                  className="control-input !mt-0"
                  aria-label="Evidence note"
                />
              </div>
            )}
            <input
              name="reason"
              required
              minLength={5}
              maxLength={300}
              placeholder="Reason (required, no phone numbers)"
              className="control-input !mt-0"
              aria-label="Reason"
            />
            <label className="flex gap-2 text-sm">
              <input type="checkbox" name="confirm" required />
              {route === "established_channel"
                ? "I'll send a code to the new number and ask the player to return it from their current attested number."
                : "I identified the player as described, and I'll send a code to the new number for them to return from it."}
            </label>
            <button className="button-primary">Start change</button>
          </form>
        </details>
      )}
    </div>
  );
}

export function CloseContactChange({
  onClose,
  reject = false,
}: {
  onClose: (reason: string) => Promise<EditResult>;
  reject?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="om-link" onClick={() => setOpen(true)}>
        {reject ? "Reject this change" : "Cancel this change"}
      </button>
    );
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onClose(
          String(new FormData(e.currentTarget).get("reason") ?? ""),
        ).then((r) => {
          if (r.ok) setOpen(false);
        });
      }}
    >
      <input
        name="reason"
        required
        minLength={5}
        maxLength={300}
        placeholder={reject ? "Why reject? (no phone numbers)" : "Why cancel?"}
        className="control-input !mt-0"
        aria-label={reject ? "Reason for rejecting" : "Reason for cancelling"}
      />
      <button className="button-secondary om-small">
        {reject ? "Reject change" : "Cancel change"}
      </button>
    </form>
  );
}

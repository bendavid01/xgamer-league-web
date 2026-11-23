"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, PhoneCall } from "lucide-react";
import { disclose, useEditSender } from "../client";
import { CorrectWhatsApp } from "./AdminFixes";
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
  canCorrect,
  reload,
}: {
  tournament: string;
  playerId: string;
  contact: ContactInfo;
  admin: boolean;
  removed: boolean;
  /** Main admins: "Correct WhatsApp" for a number that was wrong from the start. */
  canCorrect: boolean;
  reload: () => Promise<void>;
}) {
  const [shown, setShown] = useState<string | null>(null);
  // The one admin form open under the action row (none by default).
  const [panel, setPanel] = useState<"correct" | "change" | null>(null);
  const correctButton = useRef<HTMLButtonElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
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

  const canChange = contact.canEdit && !open && !removed;
  const toggle = (which: "correct" | "change") => {
    setError("");
    setNotice("");
    setPanel((p) => (p === which ? null : which));
  };
  // Closing a form puts focus back on the button that opened it.
  const closePanel = () => {
    const button = panel === "correct" ? correctButton : changeButton;
    setPanel(null);
    requestAnimationFrame(() => button.current?.focus());
  };

  return (
    <section
      className="om-card om-dcard"
      aria-labelledby="drawer-contact"
      aria-busy={busy}
    >
      <h3 id="drawer-contact" className="om-dcard-title">
        Contact
      </h3>
      <div className="om-contact">
        <span className="om-prow-label">WhatsApp number</span>
        <p className="om-phone font-mono">{shown ?? contact.masked}</p>
        <div className="om-contact-links">
          {admin && !shown && (
            <button
              type="button"
              className="om-link"
              onClick={async () => {
                const r = await disclose(tournament, playerId, "admin_review");
                if ("error" in r) return setError(r.error);
                setShown(r.phone);
                timer.current = setTimeout(() => setShown(null), 30_000);
              }}
            >
              Show for 30s
            </button>
          )}
          <ContactButton
            tournament={tournament}
            playerId={playerId}
            purpose="tournament_coordination"
          />
        </div>
        <p className="om-hint">
          {shown
            ? "Visible for 30 seconds. This view is recorded in the activity log."
            : contact.attestedAt
              ? `Organizer-attested ${new Date(contact.attestedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · ${METHOD_LABEL[contact.method ?? ""] ?? contact.method}`
              : "Legacy number · never organizer-attested"}
        </p>
      </div>
      <Feedback error={error} notice={notice} />
      {admin && !contact.editingOn && (
        <p className="om-hint">
          Changing WhatsApp numbers is switched off until it&apos;s separately
          approved.
        </p>
      )}
      {started && (
        <div className="om-subpanel space-y-2">
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
        <div className="om-subpanel space-y-3">
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
                  <div className="grid gap-2">
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
      {(canCorrect || canChange) && (
        <div className="om-action-row">
          {canCorrect && (
            <button
              ref={correctButton}
              type="button"
              className="button-secondary om-small om-toggle"
              aria-expanded={panel === "correct"}
              aria-controls="drawer-correct-whatsapp"
              onClick={() => toggle("correct")}
            >
              <PhoneCall size={15} aria-hidden="true" /> Correct WhatsApp
            </button>
          )}
          {canChange && (
            <button
              ref={changeButton}
              type="button"
              className="button-secondary om-small om-toggle"
              aria-expanded={panel === "change"}
              aria-controls="drawer-change-whatsapp"
              onClick={() => toggle("change")}
            >
              <ArrowLeftRight size={15} aria-hidden="true" /> Change WhatsApp
              number
            </button>
          )}
        </div>
      )}
      {canCorrect && panel === "correct" && (
        <CorrectWhatsApp
          id="drawer-correct-whatsapp"
          playerId={playerId}
          cancel={closePanel}
          saved={async (message) => {
            setPanel(null);
            setError("");
            setNotice(message);
            await reload();
          }}
        />
      )}
      {canChange && panel === "change" && (
        <form
          id="drawer-change-whatsapp"
          className="om-subpanel space-y-3"
          aria-label="Change WhatsApp number"
          onKeyDown={(e) => {
            if (e.key === "Escape") closePanel();
          }}
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
              if (r.ok) setPanel(null);
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
          <div>
            <p className="font-semibold">Change WhatsApp number</p>
            <p className="om-hint">
              {contact.route1Available
                ? "The current number is organizer-attested: a manual organizer record, not automated proof of ownership."
                : "Legacy number: a change needs independent evidence and a second main admin."}
            </p>
          </div>
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
          <div className="space-y-1">
            <input
              name="newPhone"
              required
              maxLength={32}
              placeholder="New WhatsApp number"
              className="control-input !mt-0"
              aria-label="New WhatsApp number"
              aria-describedby="change-phone-help"
            />
            <p id="change-phone-help" className="om-hint">
              For example +44 7911 123456, or 10 digits for India.
            </p>
          </div>
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
                      key === "efootball_possession" && !contact.hasEfootballId
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
                rows={3}
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
            placeholder="Reason (required)"
            className="control-input !mt-0"
            aria-label="Reason"
            aria-describedby="change-reason-help"
          />
          <p id="change-reason-help" className="om-hint !mt-1">
            No phone numbers in the reason.
          </p>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="confirm" required />
            {route === "established_channel"
              ? "I'll send a code to the new number and ask the player to return it from their current attested number."
              : "I identified the player as described, and I'll send a code to the new number for them to return from it."}
          </label>
          <div className="om-form-actions">
            <button className="button-primary om-small">Start change</button>
            <button
              type="button"
              className="button-secondary om-small"
              onClick={closePanel}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
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

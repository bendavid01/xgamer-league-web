"use client";

import { useState } from "react";
import Link from "next/link";
import type { PendingNewPlayerRegistration } from "@/lib/new-player-registration";
import type { PendingReturningRegistration } from "@/lib/returning-registration";

type Submit = (
  value: Record<string, unknown>,
  message: string,
) => Promise<boolean>;

function VerificationFields({ returning = true }: { returning?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          name="identityVerified"
          required
          className="mt-1"
        />
        {returning
          ? "I independently verified that this person owns the existing XG identity."
          : "I independently verified the player's identity and checked their application details."}
      </label>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          name="contactVerified"
          required
          className="mt-1"
        />
        I verified that this person controls their WhatsApp number.
      </label>
    </div>
  );
}

function ReasonField({ rejecting }: { rejecting?: boolean }) {
  return (
    <label className="block">
      {rejecting ? "Reason for rejecting" : "How did you verify the player?"}
      <textarea
        className="control-input"
        name="reason"
        rows={2}
        required
        minLength={10}
        maxLength={300}
      />
      <span className="block text-xs text-slate-400">
        Leave phone numbers, verification codes and credentials out of this
        note.
      </span>
    </label>
  );
}

function verification(data: FormData) {
  return {
    identityVerified: data.get("identityVerified") === "on",
    contactVerified: data.get("contactVerified") === "on",
  };
}

function ReviewRequest({
  request,
  rosterOpen,
  act,
}: {
  request: PendingReturningRegistration | PendingNewPlayerRegistration;
  rosterOpen: boolean;
  act: Submit;
}) {
  const [rejecting, setRejecting] = useState(false);
  const reject = rejecting || !rosterOpen;
  const returning = "code" in request;
  return (
    <details className="om-card">
      <summary className="cursor-pointer">
        <strong>{returning ? request.code : request.name}</strong> ·{" "}
        {request.team} ·{" "}
        <time dateTime={request.createdAt} className="text-slate-400">
          {new Date(request.createdAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}
        </time>
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const decision = {
            ...(returning
              ? { requestId: request.id }
              : { reference: request.reference }),
            reason: data.get("reason"),
          };
          if (reject) {
            void act(
              {
                action: returning ? "returning.reject" : "newPlayer.reject",
                ...decision,
              },
              returning
                ? "Returning-player request rejected."
                : "New-player application rejected.",
            );
          } else {
            void act(
              {
                action: returning ? "returning.approve" : "newPlayer.approve",
                ...decision,
                ...verification(data),
                verifiedPhone: data.get("verifiedPhone"),
              },
              returning
                ? "Returning player approved under their existing XG ID."
                : "New player approved.",
            );
          }
        }}
      >
        {returning ? (
          <Link
            href={`/players/${request.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="om-link"
          >
            View player history for {request.code} ↗
          </Link>
        ) : (
          <p className="text-sm">
            Application reference{" "}
            <code className="break-all">{request.reference}</code>
          </p>
        )}
        {rosterOpen && (
          <label className="block">
            Decision
            <select
              className="control-input"
              value={rejecting ? "reject" : "approve"}
              onChange={(event) =>
                setRejecting(event.currentTarget.value === "reject")
              }
            >
              <option value="approve">Approve verified player</option>
              <option value="reject">Reject request</option>
            </select>
          </label>
        )}
        {!reject && (
          <>
            <label className="block">
              Independently verified WhatsApp number
              <input
                className="control-input"
                type="tel"
                autoComplete="off"
                name="verifiedPhone"
                required
                maxLength={32}
              />
              <span className="block text-xs text-slate-400">
                Organizer Manager checks this number against the submitted
                request.
              </span>
            </label>
            <VerificationFields returning={returning} />
          </>
        )}
        <ReasonField key={reject ? "reject" : "approve"} rejecting={reject} />
        <button className={reject ? "button-secondary" : "button-primary"}>
          {reject ? "Reject request" : "Approve entry"}
        </button>
      </form>
    </details>
  );
}

export function NewPlayerApplications({
  requests,
  rosterOpen,
  act,
}: {
  requests: PendingNewPlayerRegistration[];
  rosterOpen: boolean;
  act: Submit;
}) {
  return (
    <section
      className="panel p-4 md:p-7 space-y-5"
      aria-labelledby="new-applications-title"
    >
      <h3 id="new-applications-title" className="text-xl font-bold">
        Pending new-player applications
      </h3>
      {requests.length ? (
        <>
          <p className="text-sm text-slate-400">
            Ask the applicant for their reference. Verify their identity,
            details and control of their WhatsApp number before approving.
          </p>
          {!rosterOpen && (
            <p className="notice">
              The roster is locked. Pending applications can still be rejected.
            </p>
          )}
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.reference}>
                <ReviewRequest
                  request={request}
                  rosterOpen={rosterOpen}
                  act={act}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-slate-400">No pending applications.</p>
      )}
    </section>
  );
}

export default function ReturningPlayers({
  requests,
  rosterOpen,
  act,
}: {
  requests: PendingReturningRegistration[];
  rosterOpen: boolean;
  act: Submit;
}) {
  return (
    <section
      className="panel p-4 md:p-7 space-y-5"
      aria-labelledby="returning-title"
    >
      <h3 id="returning-title" className="text-xl font-bold">
        Pending returning-player requests
      </h3>
      <p className="text-sm text-slate-400">
        Verify ownership using independent evidence, such as an established
        organizer contact or a live identity check. A matching XG ID and phone
        number alone are insufficient.
      </p>
      {!rosterOpen && (
        <p className="notice">
          The roster is locked. Pending requests can still be rejected.
        </p>
      )}
      {requests.length ? (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id}>
              <ReviewRequest
                request={request}
                rosterOpen={rosterOpen}
                act={act}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-400">No pending requests.</p>
      )}
      {rosterOpen && (
        <details className="om-card">
          <summary className="cursor-pointer font-semibold">
            Add a verified existing player
          </summary>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const success = await act(
                {
                  action: "returning.add",
                  xgId: data.get("xgId"),
                  teamName: data.get("teamName"),
                  ...verification(data),
                  reason: data.get("reason"),
                },
                "Verified player added under their existing XG ID.",
              );
              if (success) form.reset();
            }}
          >
            <label className="block">
              Verified permanent XG ID
              <input
                className="control-input"
                name="xgId"
                required
                maxLength={16}
                placeholder="XG-0007"
                autoComplete="off"
              />
            </label>
            <label className="block">
              Team for this tournament
              <input
                className="control-input"
                name="teamName"
                required
                minLength={2}
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <VerificationFields />
            <ReasonField />
            <button className="button-primary">Add player</button>
          </form>
        </details>
      )}
    </section>
  );
}

import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { Btn, Field, inputCls } from "./rap_kit";

export interface AdmissionMeeting {
  id: string;
  waiting_room?: boolean;
  passcode_required?: boolean;
  participants: { user_id: string; full_name: string | null; admission?: string }[];
}

/** Platform admission gates link release and signaling; provider rooms have their own security. */
export function MeetingAdmission({
  meeting,
  host,
  onReload,
}: {
  meeting: AdmissionMeeting;
  host: boolean;
  onReload: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [waiting, setWaiting] = useState(meeting.waiting_room ?? false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      setMessage(message);
      setPasscode("");
      onReload();
    } catch (e) {
      setMessage(extractErrorMessage(e, "Couldn’t update meeting access."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-3 text-sm">
      <summary>{host ? "Meeting access and waiting room" : "Request meeting admission"}</summary>
      <p className="my-2 text-slate-500">
        Platform access controls apply to joining here. Use the meeting provider’s controls to secure an external room
        or remove someone already connected.
      </p>
      {host ? (
        <>
          <label>
            <input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /> Enable waiting
            room
          </label>
          <Field label="New passcode (6–64 characters; empty removes it)">
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={passcode}
              maxLength={64}
              onChange={(e) => setPasscode(e.target.value)}
            />
          </Field>
          <Btn
            sm
            disabled={busy || (!!passcode && passcode.length < 6)}
            onClick={() =>
              run(
                () =>
                  api.put(`/meetings/${meeting.id}/security`, { passcode: passcode || null, waiting_room: waiting }),
                "Access updated. All admissions and passcode attempts were reset.",
              )
            }
          >
            Save access settings and reset admissions
          </Btn>
          <ul>
            {meeting.participants.map((p) => (
              <li key={p.user_id} className="my-2">
                {p.full_name || "Member"}: {p.admission || "NONE"}{" "}
                {p.admission === "WAITING" && (
                  <Btn
                    sm
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.post(`/meetings/${meeting.id}/admission/${p.user_id}`, { admission: "ADMITTED" }),
                        "Participant admitted.",
                      )
                    }
                  >
                    Admit
                  </Btn>
                )}{" "}
                {p.admission !== "DENIED" && (
                  <Btn
                    sm
                    v="line"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api.post(`/meetings/${meeting.id}/admission/${p.user_id}`, { admission: "DENIED" }),
                        "Participant denied further access.",
                      )
                    }
                  >
                    Deny access
                  </Btn>
                )}
              </li>
            ))}
          </ul>
          <Btn sm v="line" disabled={busy} onClick={onReload}>
            Refresh waiting room
          </Btn>
        </>
      ) : (
        <>
          {meeting.passcode_required && (
            <Field label="Meeting passcode">
              <input
                type="password"
                autoComplete="off"
                className={inputCls}
                value={passcode}
                maxLength={64}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </Field>
          )}
          <Btn
            sm
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await api.post<{ admission: string }>(`/meetings/${meeting.id}/admission`, {
                  passcode: passcode || null,
                });
                // Only the server decides whether admission has been granted.
                if (result.data.admission !== "ADMITTED")
                  throw {
                    response: {
                      data: {
                        detail:
                          result.data.admission === "WAITING"
                            ? "Waiting for the host to admit you. Check admission again shortly."
                            : "The host denied admission.",
                      },
                    },
                  };
              }, "Admitted. You can now join.")
            }
          >
            Check or request admission
          </Btn>
        </>
      )}
      {message && (
        <p role="status" className="mt-2">
          {message}
        </p>
      )}
    </details>
  );
}

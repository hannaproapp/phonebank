"use client";

import { useState } from "react";
import {
  DISPOSITIONS,
  CANDIDATE_AWARENESS,
  SUPPORT_LEVEL,
  VOTE_PLAN,
  CONTACTED,
} from "@/lib/fields";

function Choice({
  name,
  options,
  value,
  onChange,
  required,
}: {
  name: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(active && !required ? "" : o)}
            className={`rounded-xl border px-4 py-3 text-left text-[15px] font-medium transition ${
              active
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            {o}
          </button>
        );
      })}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

export function CallForm({
  contactId,
  candidateName,
}: {
  contactId: string;
  candidateName: string;
}) {
  const [disposition, setDisposition] = useState("");
  const [awareness, setAwareness] = useState("");
  const [support, setSupport] = useState("");
  const [plan, setPlan] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [notes, setNotes] = useState("");

  const contacted = disposition === CONTACTED;
  const wrongNumber = disposition === "Wrong Number";
  const canSave = disposition !== "" && (!contacted || (awareness && support && plan));

  // A native post, not a Server Action: action requests travel over fetch and
  // reached production with no cookies, so every save failed authentication.
  return (
    <form method="post" action="/api/do" className="space-y-6">
      <input type="hidden" name="contact_id" value={contactId} />

      <section className="space-y-2">
        <h2 className="label">How did the call go?</h2>
        <Choice
          name="disposition"
          options={DISPOSITIONS}
          value={disposition}
          onChange={setDisposition}
          required
        />
      </section>

      {contacted && (
        <>
          <section className="space-y-2">
            <h2 className="label">
              Have they heard of {candidateName || "the candidate"}?
            </h2>
            <Choice
              name="candidate_awareness"
              options={CANDIDATE_AWARENESS}
              value={awareness}
              onChange={setAwareness}
            />
          </section>

          <section className="space-y-2">
            <h2 className="label">Level of support</h2>
            <Choice
              name="support_level"
              options={SUPPORT_LEVEL}
              value={support}
              onChange={setSupport}
            />
          </section>

          <section className="space-y-2">
            <h2 className="label">How are they planning to vote?</h2>
            <Choice name="vote_plan" options={VOTE_PLAN} value={plan} onChange={setPlan} />
          </section>

          <input type="hidden" name="phone_correct" value="Correct" />
        </>
      )}

      {wrongNumber && (
        <section className="space-y-2">
          <h2 className="label">Better number, if they gave you one</h2>
          <input
            className="input"
            name="new_phone"
            inputMode="tel"
            placeholder="Optional"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
        </section>
      )}

      {disposition && (
        <section className="space-y-2">
          <h2 className="label">Notes</h2>
          <textarea
            className="input min-h-24"
            name="notes"
            placeholder="Anything worth passing on. Optional."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          className="btn btn-primary btn-lg disabled:opacity-40"
          type="submit"
          name="op"
          value="submitCall"
          disabled={!canSave}
        >
          Save and next
        </button>
        {contacted && !canSave && (
          <p className="text-center text-xs text-slate-500">
            Answer all three questions to save.
          </p>
        )}
        <button className="btn w-full text-sm text-slate-500" type="submit" name="op" value="skipContact">
          Skip for now
        </button>
      </div>
    </form>
  );
}

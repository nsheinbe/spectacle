"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";

import { sendMessageAction, type ActionState } from "@/actions/bookings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";

type MessageView = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  createdAt: string;
};

/**
 * Live-enough messages for Phase 1: refresh on an interval while the tab is
 * visible (no websockets). The list itself is server-rendered — this
 * component re-requests it via router.refresh().
 */
export function MessagePanel({
  bookingId,
  messages,
  selfId,
}: {
  bookingId: string;
  messages: MessageView[];
  selfId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sendMessageAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const interval = setInterval(tick, 7000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [router]);

  useEffect(() => {
    if (!state.error && !pending) formRef.current?.reset();
  }, [state, pending]);

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m) => (
          <li
            key={m.id}
            className={
              m.senderId === selfId
                ? "ml-8 rounded-lg rounded-br-sm bg-beam/15 p-3"
                : "mr-8 rounded-lg rounded-bl-sm bg-surface-raised p-3"
            }
          >
            <p className="text-xs text-text-faint">
              {m.senderName} · {m.createdAt}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-text">{m.body}</p>
          </li>
        ))}
        {messages.length === 0 && (
          <li className="text-sm text-text-muted">No messages yet — say hello.</li>
        )}
      </ul>
      <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
        <input type="hidden" name="bookingId" value={bookingId} />
        <Textarea
          name="body"
          required
          maxLength={4000}
          placeholder="Write a message…"
          className="min-h-11 flex-1"
        />
        <Button type="submit" disabled={pending} className="self-end">
          Send
        </Button>
      </form>
      {state.error && <p className="mt-1 text-sm text-danger">{state.error}</p>}
    </div>
  );
}

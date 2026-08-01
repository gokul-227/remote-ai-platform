"use client";

import { useState } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";

export default function MessagesPage() {
  const conversations = useConversations(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const messages = useMessages(selected);
  return <main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[280px_1fr]"><section><h1 className="text-3xl font-bold text-slate-900">Messages</h1><p className="mt-2 text-slate-600">Private conversations with your network.</p><div className="mt-6 space-y-2">{conversations.isLoading ? <p className="text-sm text-slate-500">Loading conversations…</p> : (conversations.data ?? []).length === 0 ? <div className="card-enterprise p-5 text-sm text-slate-500">No conversations yet.</div> : (conversations.data ?? []).map((conversation: { id: string }) => <button key={conversation.id} onClick={() => setSelected(conversation.id)} className={`card-enterprise block w-full p-4 text-left ${selected === conversation.id ? "border-[#0A66C2]" : ""}`}>Conversation {conversation.id.slice(0, 8)}</button>)}</div></section><section className="card-enterprise flex min-h-[420px] flex-col p-5"><div className="border-b border-slate-200 pb-4"><h2 className="font-semibold text-slate-900">{selected ? "Conversation" : "Select a conversation"}</h2><p className="text-sm text-slate-500">{messages.connected ? "Live connection" : "Message history"}</p></div><div className="flex-1 space-y-3 py-5">{selected && messages.messages.length ? messages.messages.map((message) => <p key={message.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{message.content}</p>) : <p className="text-sm text-slate-500">Messages will appear here.</p>}</div>{selected && <form onSubmit={(event) => { event.preventDefault(); messages.send(draft); setDraft(""); }} className="flex gap-3 border-t border-slate-200 pt-4"><input value={draft} onChange={(event) => setDraft(event.target.value)} className="input-enterprise" placeholder="Write a message" /><button className="button-primary" type="submit">Send</button></form>}</section></main>;
}

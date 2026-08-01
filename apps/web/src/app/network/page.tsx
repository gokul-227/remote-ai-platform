"use client";

import { useState } from "react";
import { useConnections } from "@/hooks/useConnections";

export default function NetworkPage() {
  const [receiverId, setReceiverId] = useState("");
  const connections = useConnections(true);
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-bold text-slate-900">Network</h1><p className="mt-2 text-slate-600">Build trusted connections with freelancers and hiring teams.</p><section className="card-enterprise mt-6 p-5"><h2 className="font-semibold text-slate-900">Send a connection request</h2><div className="mt-3 flex gap-3"><input value={receiverId} onChange={(event) => setReceiverId(event.target.value)} className="input-enterprise" placeholder="Profile user ID" /><button className="button-primary" disabled={!receiverId || connections.request.isPending} onClick={() => connections.request.mutate(receiverId)}>Connect</button></div>{connections.request.isError && <p className="mt-2 text-sm text-red-700">Unable to send this request.</p>}</section><section className="mt-6 space-y-3">{connections.isLoading ? <div className="card-enterprise p-6 text-slate-500">Loading connections…</div> : connections.isError ? <div className="card-enterprise p-6 text-red-700">Unable to load connections. <button className="font-semibold" onClick={() => connections.refetch()}>Retry</button></div> : (connections.data ?? []).length === 0 ? <div className="card-enterprise p-6 text-slate-500">No connections yet.</div> : (connections.data ?? []).map((connection: { id: string; sender_id: string; receiver_id: string; status: string }) => <article key={connection.id} className="card-enterprise flex items-center justify-between p-5"><div><p className="font-medium text-slate-900">Connection request</p><p className="text-sm text-slate-500">{connection.sender_id} → {connection.receiver_id}</p></div><span className="badge-enterprise">{connection.status}</span></article>)}</section></main>;
}

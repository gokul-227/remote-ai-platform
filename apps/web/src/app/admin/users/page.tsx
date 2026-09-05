"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, ChevronLeft, ChevronRight, Search } from "lucide-react";
import api from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { Select, SearchInput } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: "ENGINEER" | "COMPANY" | "ADMIN";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const LIMIT = 20;

function AdminUsersContent() {
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users", role, page],
    queryFn: async () => (await api.get("/admin/users", { params: { role: role || undefined, skip: page * LIMIT, limit: LIMIT } })).data,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ userId, is_active }: { userId: string; is_active: boolean }) =>
      api.patch(`/admin/users/${userId}/status`, { is_active }).then((r) => r.data),
    onSuccess: (updated: AdminUser) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setSelected((s) => (s && s.id === updated.id ? updated : s));
    },
  });

  const rows = (users ?? []).filter((u) => !search || u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Users className="h-5 w-5 text-[#0552CC]" />User Management</h1>
        <p className="text-xs text-slate-500 mt-1">Search, filter, and moderate platform accounts.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…" className="max-w-xs" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }} className="w-auto">
          <option value="">All roles</option>
          <option value="ENGINEER">Professional</option>
          <option value="COMPANY">Organization</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </div>

      <div className="card-enterprise overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="No users found" description="Try a different search term or role filter." />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-subtle)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-subtle)] cursor-pointer" onClick={() => setSelected(u)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={u.full_name} size="sm" />
                      <div>
                        <p className="font-medium text-slate-900">{u.full_name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge tone="neutral">{u.role}</Badge></td>
                  <td className="px-4 py-3"><StatusBadge label={u.is_active ? "Active" : "Suspended"} tone={u.is_active ? "success" : "danger"} /></td>
                  <td className="px-4 py-3 text-slate-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={u.is_active ? "secondary" : "primary"}
                      loading={toggleStatus.isPending}
                      onClick={(e) => { e.stopPropagation(); toggleStatus.mutate({ userId: u.id, is_active: !u.is_active }); }}
                    >
                      {u.is_active ? "Suspend" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" disabled={page === 0} icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
        <span className="text-xs text-slate-500">Page {page + 1}</span>
        <Button variant="secondary" size="sm" disabled={(users?.length ?? 0) < LIMIT} onClick={() => setPage((p) => p + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="User Details">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar name={selected.full_name} size="lg" />
              <div>
                <p className="font-semibold text-slate-900">{selected.full_name}</p>
                <p className="text-xs text-slate-500">{selected.email}</p>
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Role</dt><dd className="font-medium text-slate-900">{selected.role}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge label={selected.is_active ? "Active" : "Suspended"} tone={selected.is_active ? "success" : "danger"} /></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Joined</dt><dd className="font-medium text-slate-900">{new Date(selected.created_at).toLocaleDateString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">User ID</dt><dd className="font-mono text-xs text-slate-500">{selected.id}</dd></div>
            </dl>
            <Button
              fullWidth
              variant={selected.is_active ? "danger" : "primary"}
              loading={toggleStatus.isPending}
              onClick={() => toggleStatus.mutate({ userId: selected.id, is_active: !selected.is_active })}
            >
              {selected.is_active ? "Suspend User" : "Activate User"}
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <AdminUsersContent />
    </RequireRole>
  );
}

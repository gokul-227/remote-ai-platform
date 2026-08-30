"use client";

import { useState } from "react";
import {
  Users, Plus, Lock, Globe, CheckCircle, Zap, Code, Cpu, Layers, Briefcase,
  Heart, Coffee, MessageCircle, Send, LogIn, LogOut, Clock,
} from "lucide-react";
import { useGroups, useMyGroups, useCreateGroup, useJoinGroup, useLeaveGroup, useGroupPosts, useCreateGroupPost, Group } from "@/hooks/useGroups";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea, Select, SearchInput } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { RequireAuth } from "@/components/RequireAuth";

const CATEGORIES = [
  { id: "all", label: "All Groups", icon: Layers },
  { id: "technology", label: "Technology", icon: Cpu },
  { id: "frontend", label: "Frontend", icon: Code },
  { id: "backend", label: "Backend", icon: Zap },
  { id: "devops", label: "DevOps", icon: Layers },
  { id: "career", label: "Career", icon: Briefcase },
  { id: "general", label: "General", icon: Coffee },
  { id: "design", label: "Design", icon: Heart },
];

function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const cat = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const Icon = cat.icon;
  return <Icon className={className} />;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function GroupCard({
  group, onClick, onJoin, onLeave, joining, leaving,
}: {
  group: Group; onClick: () => void; onJoin: () => void; onLeave: () => void; joining: boolean; leaving: boolean;
}) {
  return (
    <div onClick={onClick} className="card-enterprise overflow-hidden flex flex-col cursor-pointer hover:border-slate-300 transition-colors">
      <div className="h-16 bg-[var(--color-ai-soft)] relative flex items-center justify-center">
        <CategoryIcon category={group.category} className="h-8 w-8 text-[var(--color-ai)] opacity-60" />
        {group.is_verified && <CheckCircle className="absolute top-2.5 right-2.5 h-4 w-4 text-emerald-500" />}
        {group.is_private && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-black/40 rounded-full px-2 py-0.5 text-[10px] text-white">
            <Lock className="h-2.5 w-2.5" />Private
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500 capitalize">
              <CategoryIcon category={group.category} className="h-3 w-3" />
              {group.category}
            </div>
          </div>
          {group.is_member && <Badge tone="ai">{group.my_role ?? "member"}</Badge>}
        </div>

        {group.description && <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{group.description}</p>}

        {group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {group.tags.slice(0, 3).map((tag) => <Badge key={tag} tone="neutral">#{tag}</Badge>)}
            {group.tags.length > 3 && <span className="text-xs text-slate-400">+{group.tags.length - 3}</span>}
          </div>
        )}

        <div className="flex items-center gap-3 mt-auto pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{group.member_count.toLocaleString()} members</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{group.post_count.toLocaleString()} posts</span>
        </div>

        <Button
          size="sm"
          variant={group.is_member ? "secondary" : "primary"}
          fullWidth
          disabled={joining || leaving}
          icon={group.is_member ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
          onClick={(e) => { e.stopPropagation(); if (group.is_member) onLeave(); else onJoin(); }}
        >
          {group.is_member ? "Leave" : group.is_private ? "Request to Join" : "Join Group"}
        </Button>
      </div>
    </div>
  );
}

function GroupDetailPanel({ group, onClose }: { group: Group; onClose: () => void }) {
  const { data: postsData, isLoading: postsLoading } = useGroupPosts(group.id);
  const createPost = useCreateGroupPost(group.id);
  const [postContent, setPostContent] = useState("");

  const handlePost = () => {
    if (!postContent.trim()) return;
    createPost.mutate(postContent.trim(), { onSuccess: () => setPostContent("") });
  };

  return (
    <Drawer open onClose={onClose}>
      <div className="-mx-5 -mt-4 px-5 pt-4 pb-4 bg-[var(--color-ai-soft)] border-b border-[var(--border-color)] mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white flex items-center justify-center shrink-0">
              <CategoryIcon category={group.category} className="h-5 w-5 text-[var(--color-ai)]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{group.name}</h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                {group.is_verified && <CheckCircle className="h-3 w-3 text-emerald-500" />}
                {group.is_private ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {group.is_private ? "Private" : "Public"} · {group.member_count.toLocaleString()} members
              </div>
            </div>
          </div>
        </div>
        {group.description && <p className="text-sm text-slate-600 mt-3">{group.description}</p>}
        {group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {group.tags.map((tag) => <Badge key={tag} tone="ai">#{tag}</Badge>)}
          </div>
        )}
      </div>

      {group.is_member && (
        <div className="flex gap-2.5 mb-4">
          <Avatar name="You" size="sm" />
          <div className="flex-1 space-y-2">
            <Textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} placeholder="Share something with the group…" rows={2} />
            <div className="flex justify-end">
              <Button size="sm" disabled={!postContent.trim()} loading={createPost.isPending} icon={<Send className="h-3.5 w-3.5" />} onClick={handlePost}>
                Post
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {postsLoading && <p className="text-center text-sm text-slate-400 pt-8">Loading posts…</p>}
        {!postsLoading && !group.is_member && !group.is_private && (
          <EmptyState icon={Users} title="Join this group to post and interact" />
        )}
        {postsData?.posts.map((post) => (
          <div key={post.id} className="card-enterprise p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={post.author_id.slice(0, 6)} size="sm" />
                <div>
                  <div className="text-sm font-semibold text-slate-900">Member</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(post.created_at)}</div>
                </div>
              </div>
              {post.is_pinned && <Badge tone="warning">Pinned</Badge>}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{post.content}</p>
            <div className="flex gap-4 mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{post.like_count}</span>
              <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />{post.comment_count}</span>
            </div>
          </div>
        ))}
        {postsData?.posts.length === 0 && group.is_member && (
          <p className="text-center text-sm text-slate-400 pt-6">No posts yet. Be the first to share something!</p>
        )}
      </div>
    </Drawer>
  );
}

function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createGroup = useCreateGroup();
  const [form, setForm] = useState({ name: "", description: "", category: "general", tags: "", is_private: false });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createGroup.mutate(
      { name: form.name, description: form.description || undefined, category: form.category, tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [], is_private: form.is_private },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Create a Community">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Community Name" required minLength={2} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Remote Python Developers" />
        <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this community about?" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {CATEGORIES.filter((c) => c.id !== "all").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <div>
            <label className="text-sm font-medium text-[var(--text-main)] block mb-1.5">Visibility</label>
            <div className="flex gap-2">
              {[{ v: false, label: "Public", icon: Globe }, { v: true, label: "Private", icon: Lock }].map(({ v, label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_private: v }))}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5",
                    form.is_private === v ? "border-[#B54A2C] bg-[var(--color-brand-light)] text-[#B54A2C]" : "border-[var(--border-color)] text-slate-500"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Input label="Tags" hint="Comma-separated" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="python, backend, async" />
        <Button type="submit" fullWidth size="lg" disabled={!form.name.trim()} loading={createGroup.isPending}>Create Community</Button>
      </form>
    </Modal>
  );
}

export default function GroupsPage() {
  return (
    <RequireAuth>
      <GroupsContent />
    </RequireAuth>
  );
}

function GroupsContent() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"discover" | "joined">("discover");

  const { data: groupsData, isLoading } = useGroups({ category: selectedCategory === "all" ? undefined : selectedCategory, search: search || undefined });
  const { data: myGroupsData } = useMyGroups();
  const joinGroup = useJoinGroup();
  const leaveGroup = useLeaveGroup();

  const displayGroups = tab === "joined" ? (myGroupsData?.groups ?? []) : (groupsData?.groups ?? []);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Communities</h1>
          <p className="text-xs text-slate-500 mt-1">Connect with professionals, share knowledge, and grow together.</p>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setShowCreate(true)}>Create Community</Button>
      </div>

      <Tabs
        items={[
          { key: "discover", label: "Discover", count: groupsData?.total },
          { key: "joined", label: "My Communities", count: myGroupsData?.total ?? 0 },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === "discover" && (
        <>
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search communities…" className="max-w-sm" />
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className="cursor-pointer">
                  <Badge tone={active ? "brand" : "neutral"}>
                    <cat.icon className="h-3 w-3" />{cat.label}
                  </Badge>
                </button>
              );
            })}
          </div>
        </>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
        </div>
      ) : displayGroups.length === 0 ? (
        <div className="card-enterprise">
          <EmptyState
            icon={Users}
            title={tab === "joined" ? "You haven't joined any communities yet" : "No communities found"}
            description={tab === "joined" ? "Discover and join communities that match your interests." : "Try a different search or category."}
            actionLabel={tab === "joined" ? "Browse Communities" : undefined}
            onAction={tab === "joined" ? () => setTab("discover") : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onClick={() => setSelectedGroup(group)}
              onJoin={() => joinGroup.mutate(group.id)}
              onLeave={() => leaveGroup.mutate(group.id)}
              joining={joinGroup.isPending}
              leaving={leaveGroup.isPending}
            />
          ))}
        </div>
      )}

      {selectedGroup && <GroupDetailPanel group={selectedGroup} onClose={() => setSelectedGroup(null)} />}
      <CreateGroupModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

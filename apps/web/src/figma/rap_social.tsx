import { useState, useEffect } from "react";
import { Ic, Av, Btn, Card, Tag, Modal, cx } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, timeAgo, goRoute } from "./live";
const go = (r: string) => {
  goRoute(r);
};
export function Feed() {
  /* Live: /social feed, likes, comments, posts, moderation reports */ const { user } = useAuth();
  const me = user?.full_name || "You";
  const first = me.split(" ")[0];
  const [page, setPage] = useState(1);
  const feed = useApi<any>(user ? "/social/feed" : "/social/posts/public", { page: 1, page_size: 20 * page });
  const [local, setLocal] = useState<Record<string, any>>({});
  const posts = (feed.data?.posts ?? [])
    .map((p: any) => ({ ...p, ...(local[p.id] || {}) }))
    .filter((p: any) => !p.hidden);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [txt, setTxt] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const [reason, setReason] = useState("Spam or misleading content");
  const [notice, setNotice] = useState("");
  const [audience, setAudience] = useState("Public");
  const [sort, setSort] = useState("Latest");
  const patch = (id: string, v: any) => setLocal((l) => ({ ...l, [id]: { ...(l[id] || {}), ...v } }));
  const fail = (e: unknown, m: string) => setNotice(extractErrorMessage(e, m));
  const like = async (p: any) => {
    if (!user) {
      go("login");
      return;
    }
    try {
      const r = await api.post(`/social/posts/${p.id}/like`);
      patch(p.id, { liked_by_me: r.data.liked, like_count: r.data.like_count });
    } catch (e) {
      fail(e, "Couldn't update your like.");
    }
  };
  const openComments = async (id: string) => {
    if (comment === id) {
      setComment(null);
      return;
    }
    setComment(id);
    try {
      const r = await api.get(`/social/posts/${id}/comments`);
      setComments((c) => ({ ...c, [id]: r.data }));
    } catch {}
  };
  const sendComment = async (p: any) => {
    if (!txt.trim()) return;
    try {
      const r = await api.post(`/social/posts/${p.id}/comments`, { content: txt.trim() });
      setComments((c) => ({ ...c, [p.id]: [...(c[p.id] || []), r.data] }));
      patch(p.id, { comment_count: (p.comment_count || 0) + 1 });
      setTxt("");
    } catch (e) {
      fail(e, "Couldn't post your comment.");
    }
  };
  const submitPost = async () => {
    if (!draft.trim()) return;
    try {
      if (edit) {
        await api.patch(`/social/posts/${edit}`, {
          content: draft.trim(),
          visibility: audience === "Connections" ? "CONNECTIONS" : "PUBLIC",
        });
        patch(edit, { content: draft.trim() });
      } else {
        await api.post("/social/posts", {
          content: draft.trim(),
          visibility: audience === "Connections" ? "CONNECTIONS" : "PUBLIC",
        });
        feed.reload();
      }
      setCompose(false);
    } catch (e) {
      fail(e, "Couldn't save your post.");
    }
  };
  const remove = async (id: string) => {
    try {
      await api.delete(`/social/posts/${id}`);
      patch(id, { hidden: true });
    } catch (e) {
      fail(e, "Couldn't delete that post.");
    }
  };
  const submitReport = async () => {
    if (!report) return;
    try {
      await api.post("/moderation/reports", { target_type: "POST", target_id: report, reason });
      setNotice("Report submitted for review");
    } catch (e) {
      fail(e, "Couldn't submit that report.");
    }
    setReport(null);
  };
  const sorted = [...posts].sort((a: any, b: any) => (sort === "Most liked" ? b.like_count - a.like_count : 0));
  return (
    <div className="space-y-5">
      {user && (
        <div className="rap-panel p-5">
          <div className="flex items-center gap-3">
            <Av name={me} s={44} />
            <button
              onClick={() => {
                setDraft("");
                setEdit(null);
                setCompose(true);
              }}
              className="flex-1 rounded-full bg-slate-100 px-5 py-3 text-left text-slate-500 hover:bg-slate-200"
            >
              Share an update, {first}
            </button>
          </div>
          <div className="mt-4 flex border-t border-slate-200 pt-3">
            <button
              className="flex flex-1 items-center justify-center gap-2 py-1.5 font-medium text-sm text-slate-600"
              onClick={() => {
                setDraft("");
                setEdit(null);
                setCompose(true);
              }}
            >
              <Ic n="edit" c="text-blue-600" />
              Write a post
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 py-1.5 font-medium text-sm text-slate-600"
              onClick={() => go("postjob")}
            >
              <Ic n="briefcase" c="text-emerald-600" />
              Share a role
            </button>
            <button
              className="flex flex-1 items-center justify-center gap-2 py-1.5 font-medium text-sm text-slate-600"
              onClick={() => go("groups")}
            >
              <Ic n="users" c="text-indigo-600" />
              Find a group
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <h3>{user ? "Your community" : "Community posts"}</h3>
        <select
          aria-label="Feed order"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-transparent text-slate-500"
        >
          <option>Latest</option>
          <option>Most liked</option>
        </select>
      </div>
      {feed.loading && !feed.data && <div className="rap-panel p-8 text-center text-slate-500">Loading your feed…</div>}
      {sorted.map((p: any) => {
        const by = p.author?.full_name || "Member";
        const mine = p.author_id === user?.id;
        return (
          <article key={p.id} className="rap-panel overflow-hidden">
            <header className="flex items-start gap-3 p-5 pb-3">
              <Av name={by} s={44} />
              <div className="flex-1 min-w-0">
                <b className="font-semibold">{by}</b>
                <p className="text-xs text-slate-500 truncate">
                  {(p.author?.role || "").charAt(0) + (p.author?.role || "").slice(1).toLowerCase()}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {timeAgo(p.created_at)} ·{" "}
                  <Ic n={p.visibility === "CONNECTIONS" ? "users" : "globe"} s={11} c="inline" />
                </p>
              </div>
              {user && (
                <details className="relative">
                  <summary
                    aria-label={"Post options for " + by}
                    className="list-none cursor-pointer text-slate-500 p-2"
                  >
                    <Ic n="more" />
                  </summary>
                  <div className="absolute right-0 top-9 z-10 w-48 rounded-lg bg-white border border-slate-200 shadow-lg p-2">
                    {mine && (
                      <>
                        <button
                          className="rap-nav"
                          onClick={() => {
                            setEdit(p.id);
                            setDraft(p.content);
                            setAudience(p.visibility === "CONNECTIONS" ? "Connections" : "Public");
                            setCompose(true);
                          }}
                        >
                          Edit post
                        </button>
                        <button className="rap-nav" onClick={() => remove(p.id)}>
                          Delete post
                        </button>
                      </>
                    )}
                    {!mine && (
                      <button className="rap-nav" onClick={() => setReport(p.id)}>
                        Report post
                      </button>
                    )}
                    <button className="rap-nav" onClick={() => patch(p.id, { hidden: true })}>
                      Hide from my feed
                    </button>
                  </div>
                </details>
              )}
            </header>
            <p className="px-5 pb-5 whitespace-pre-line leading-7">{p.content}</p>
            {p.link_url && (
              <a
                href={p.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mx-5 mb-4 block rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-blue-600"
              >
                {p.link_preview_title || p.link_url}
              </a>
            )}
            <div className="mx-5 flex items-center justify-between border-b border-slate-200 py-3 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-blue-600 p-1 text-white">
                  <Ic n="thumb" s={11} />
                </span>
                {p.like_count}
              </span>
              <button onClick={() => openComments(p.id)}>{p.comment_count} comments</button>
            </div>
            <div className="flex p-2 px-4">
              <button
                onClick={() => like(p)}
                className={cx(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-semibold text-sm hover:bg-slate-100",
                  p.liked_by_me ? "text-blue-600" : "text-slate-500",
                )}
              >
                <Ic n="thumb" s={19} />
                {p.liked_by_me ? "Liked" : "Like"}
              </button>
              <button
                onClick={() => openComments(p.id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-semibold text-sm text-slate-500 hover:bg-slate-100"
              >
                <Ic n="comment" s={19} />
                Comment
              </button>
            </div>
            {comment === p.id && (
              <div className="p-5 pt-1 space-y-4">
                {(comments[p.id] || []).map((c: any) => (
                  <div key={c.id} className="flex gap-2">
                    <Av name={c.author?.full_name || "Member"} s={32} />
                    <div className="rounded-2xl bg-slate-100 px-4 py-2">
                      <b className="text-xs">{c.author?.full_name || "Member"}</b>
                      <p className="text-sm">{c.content}</p>
                    </div>
                  </div>
                ))}
                {user && (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendComment(p);
                    }}
                  >
                    <Av name={me} s={32} />
                    <input
                      aria-label="Write a comment"
                      placeholder="Write a comment…"
                      className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 text-sm"
                      value={txt}
                      onChange={(e) => setTxt(e.target.value)}
                    />
                    <button aria-label="Send comment" className="p-2 text-blue-600">
                      <Ic n="send" s={18} />
                    </button>
                  </form>
                )}
              </div>
            )}
          </article>
        );
      })}
      {!feed.loading && !sorted.length && (
        <div className="rap-panel v2-empty">
          <Ic n="users" s={36} c="mx-auto" />
          <h3>Your feed is quiet</h3>
          <p>Connect with people and share an update to get the conversation started.</p>
        </div>
      )}
      {feed.data?.has_more ? (
        <p className="text-center py-5">
          <button className="text-sm font-semibold text-blue-600" onClick={() => setPage(page + 1)}>
            Show more posts
          </button>
        </p>
      ) : (
        sorted.length > 0 && <p className="text-center text-xs text-slate-400 py-5">You’re all caught up.</p>
      )}
      <Modal open={compose} onClose={() => setCompose(false)} title={edit ? "Edit post" : "Create a post"}>
        <div className="flex gap-3 items-center mb-5">
          <Av name={me} />
          <div>
            <b>{me}</b>
            <select
              aria-label="Post visibility"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="block text-xs bg-slate-100 p-1 rounded mt-1"
            >
              <option>Public</option>
              <option>Connections</option>
            </select>
          </div>
        </div>
        <textarea
          aria-label="Post content"
          value={draft}
          maxLength={3000}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Share something with your network…"
          className="w-full resize-none outline-none text-lg"
        />
        <p className="text-xs text-slate-500 mb-4">
          {audience === "Connections" ? "Visible to your connections." : "Visible to everyone on Remote AI Platform."}
        </p>
        <Btn full onClick={submitPost}>
          {edit ? "Save changes" : "Post"}
        </Btn>
      </Modal>
      <Modal open={report !== null} onClose={() => setReport(null)} title="Report this post">
        <p className="text-sm text-slate-500">Help keep the community useful and respectful.</p>
        <label className="v2-field">
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option>Spam or misleading content</option>
            <option>Harassment</option>
            <option>Inappropriate content</option>
            <option>Other</option>
          </select>
        </label>
        <Btn full onClick={submitReport}>
          Submit report
        </Btn>
      </Modal>
      {notice && (
        <button onClick={() => setNotice("")} className="v2-toast">
          {notice} · Dismiss
        </button>
      )}
    </div>
  );
}
const tint = (s: string) =>
  ["#dce8f3", "#e3ebe3", "#ede5dd", "#e7e5f1", "#e5edf6"][[...(s || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
export function Groups({ initial }: { initial?: string | null } = {}) {
  /* Live: /groups (discover, joined, detail, posts, members, join/leave, manage) */ const { user } = useAuth();
  const me = user?.full_name || "You";
  const [tab, setTab] = useState("Discover");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(initial || null);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [detailTab, setDetailTab] = useState("Discussion");
  const [post, setPost] = useState("");
  const [notice, setNotice] = useState("");
  const discover = useApi<any>(user ? "/groups" : null, { search: search || undefined, page_size: 50 });
  const joined = useApi<any>(user ? "/groups/me/joined" : null, { page_size: 50 });
  const gq = useApi<any>(selected ? `/groups/${selected}` : null);
  const posts = useApi<any>(selected && detailTab === "Discussion" ? `/groups/${selected}/posts` : null, {
    page_size: 50,
  });
  const members = useApi<any[]>(selected && detailTab === "Members" ? `/groups/${selected}/members` : null, {
    page_size: 100,
  });
  const g = gq.data;
  const list = ((tab === "Your groups" ? joined.data?.groups : discover.data?.groups) ?? []).filter((x: any) =>
    x.name.toLowerCase().includes(q.toLowerCase()),
  );
  const canManage = g && ["owner", "admin"].includes((g.my_role || "").toLowerCase());
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) setNotice(ok);
      gq.reload();
      joined.reload();
      discover.reload();
    } catch (e) {
      setNotice(extractErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  if (!user)
    return (
      <div className="v2-page">
        <div className="rap-panel v2-empty">
          <Ic n="users" s={36} c="mx-auto" />
          <h3>Sign in to find your community</h3>
          <p>Groups are for Remote AI Platform members.</p>
          <div className="mt-4">
            <Btn onClick={() => go("login")}>Sign in</Btn>
          </div>
        </div>
      </div>
    );
  return (
    <div className="v2-page">
      {selected ? (
        !g ? (
          <div className="rap-panel p-10 text-center text-slate-500">
            {gq.error ? "This group isn’t available." : "Loading group…"}
            <div className="mt-4">
              <button className="text-blue-600 text-sm" onClick={() => setSelected(null)}>
                ← All groups
              </button>
            </div>
          </div>
        ) : (
          <>
            <button className="text-blue-600 text-sm mb-5" onClick={() => setSelected(null)}>
              ← All groups
            </button>
            <div className="rap-panel overflow-hidden">
              <div className="h-40 flex items-center justify-center" style={{ background: tint(g.name) }}>
                <Ic n="users" s={70} c="text-[#526b84]" />
              </div>
              <div className="p-7 flex justify-between items-center">
                <div>
                  <h1>{g.name}</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {g.is_private ? "Private" : "Public"} group · {g.member_count} member
                    {g.member_count === 1 ? "" : "s"}
                  </p>
                </div>
                {(g.my_role || "").toLowerCase() !== "owner" && (
                  <Btn
                    v={g.is_member ? "gray" : "primary"}
                    onClick={() =>
                      run(
                        () => api.post(`/groups/${g.id}/${g.is_member ? "leave" : "join"}`),
                        g.is_member
                          ? "You left the group"
                          : g.is_private
                            ? "Request sent to join"
                            : "Welcome to the group",
                      )
                    }
                  >
                    {g.is_member ? "Leave group" : "Join group"}
                  </Btn>
                )}
              </div>
              <div className="flex px-5 border-t border-slate-200">
                {["Discussion", "Members", "About", ...(canManage ? ["Manage"] : [])].map((t) => (
                  <button
                    key={t}
                    onClick={() => setDetailTab(t)}
                    className={cx(
                      "px-5 py-4 text-sm font-semibold border-b-2",
                      t === detailTab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-6">
              {detailTab === "Discussion" ? (
                <>
                  <form
                    className="rap-panel p-5 flex gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (post.trim() && g.is_member) {
                        run(async () => {
                          await api.post(`/groups/${g.id}/posts`, { content: post.trim() });
                          setPost("");
                          posts.reload();
                        });
                      }
                    }}
                  >
                    <Av name={me} />
                    <input
                      aria-label="Group post"
                      disabled={!g.is_member}
                      placeholder={g.is_member ? "Start a discussion…" : "Join to participate"}
                      value={post}
                      onChange={(e) => setPost(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-100 rounded-full px-4"
                    />
                    <button className="rap-button" disabled={!g.is_member}>
                      Post
                    </button>
                  </form>
                  {(posts.data?.posts ?? []).map((p: any) => (
                    <Card key={p.id} c="mt-4">
                      <div className="flex items-center gap-2">
                        <Av name={p.author?.full_name || "Member"} s={32} />
                        <b>{p.author?.full_name || "Member"}</b>
                        <span className="text-xs text-slate-500">{timeAgo(p.created_at)}</span>
                        {(p.author_id === user.id || canManage) && (
                          <button
                            className="ml-auto text-xs text-slate-500 hover:text-red-600"
                            onClick={() =>
                              run(async () => {
                                await api.delete(`/groups/${g.id}/posts/${p.id}`);
                                posts.reload();
                              })
                            }
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <p className="mt-3 whitespace-pre-line">{p.content}</p>
                    </Card>
                  ))}
                  {!(posts.data?.posts ?? []).length && (
                    <Card c="mt-4 !p-7">
                      <b>Welcome to {g.name}</b>
                      <p className="mt-3 text-slate-500">
                        Introduce yourself, share what you’re building, and ask your community for feedback.
                      </p>
                    </Card>
                  )}
                </>
              ) : detailTab === "Members" ? (
                <div className="v2-list">
                  {(members.data ?? []).map((m: any) => (
                    <div className="v2-row" key={m.id}>
                      <Av name={m.member?.full_name || "Member"} />
                      <div className="v2-row-main">
                        <b>{m.member?.full_name || "Member"}</b>
                        <p>{m.member?.headline || ""}</p>
                      </div>
                      <Tag>{(m.role || "member").charAt(0).toUpperCase() + (m.role || "member").slice(1)}</Tag>
                    </div>
                  ))}
                  {!!members.error && <div className="v2-row">Join this group to see its members.</div>}
                </div>
              ) : detailTab === "About" ? (
                <Card c="!p-7">
                  <h2>About this community</h2>
                  <p className="mt-4 whitespace-pre-line">{g.description || "No description yet."}</p>
                  {(g.tags || []).length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {g.tags.map((t: string) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  )}
                  <h3 className="mt-6">Community guidelines</h3>
                  <p className="mt-2 text-slate-500">
                    Be respectful. Share relevant work. Explain your questions and give constructive feedback.
                  </p>
                </Card>
              ) : (
                <Card c="!p-7">
                  <h2>Group settings</h2>
                  <label className="v2-field">
                    Name
                    <input
                      defaultValue={g.name}
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value !== g.name &&
                        run(() => api.patch(`/groups/${g.id}`, { name: e.target.value.trim() }), "Group updated")
                      }
                    />
                  </label>
                  <label className="v2-field">
                    Description
                    <textarea
                      defaultValue={g.description || ""}
                      onBlur={(e) =>
                        e.target.value !== (g.description || "") &&
                        run(() => api.patch(`/groups/${g.id}`, { description: e.target.value }), "Group updated")
                      }
                    />
                  </label>
                  <p className="text-xs text-slate-500">Changes save when you leave a field.</p>
                </Card>
              )}
            </div>
          </>
        )
      ) : (
        <>
          <div className="v2-page-head">
            <div>
              <h1>Find your community</h1>
              <p>Meet people who care about the work you do.</p>
            </div>
            <Btn icon="plus" onClick={() => setCreate(true)}>
              Create group
            </Btn>
          </div>
          <form
            className="v2-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
            }}
          >
            <input
              aria-label="Search groups"
              placeholder="Search groups"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {["Discover", "Your groups"].map((t) => (
              <Btn key={t} v={tab === t ? "primary" : "gray"} onClick={() => setTab(t)}>
                {t}
              </Btn>
            ))}
          </form>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
            {list.map((g: any) => (
              <div key={g.id} className="rap-panel overflow-hidden">
                <button
                  className="w-full h-36 flex items-center justify-center"
                  style={{ background: tint(g.name) }}
                  onClick={() => {
                    setSelected(g.id);
                    setDetailTab("Discussion");
                  }}
                >
                  <Ic n="users" s={56} c="text-[#526b84]" />
                </button>
                <div className="p-5">
                  <button
                    onClick={() => {
                      setSelected(g.id);
                      setDetailTab("Discussion");
                    }}
                    className="font-semibold text-left text-lg"
                  >
                    {g.name}
                  </button>
                  <p className="text-xs text-slate-500 mt-1">
                    {g.member_count} member{g.member_count === 1 ? "" : "s"} · {g.is_private ? "Private" : "Public"}
                  </p>
                  <p className="text-sm text-slate-500 my-4 min-h-10">{g.description}</p>
                  <Btn
                    full
                    v={g.is_member ? "gray" : "outline"}
                    onClick={() => {
                      setSelected(g.id);
                      setDetailTab("Discussion");
                    }}
                  >
                    {g.is_member ? "View group" : "Explore group"}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
          {!(discover.loading || joined.loading) && !list.length && (
            <div className="rap-panel v2-empty mt-4">
              <Ic n="users" s={36} c="mx-auto" />
              <h3>{tab === "Your groups" ? "You haven’t joined any groups yet" : "No groups found"}</h3>
              <p>
                {tab === "Your groups"
                  ? "Discover a community or create your own."
                  : "Try another search, or create the group you’re looking for."}
              </p>
            </div>
          )}
        </>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="Create a group">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api.post("/groups", { name: name.trim(), description: desc.trim() || undefined });
              setCreate(false);
              setName("");
              setDesc("");
              setSelected(r.data.id);
            }, "Group created");
          }}
        >
          <label className="v2-field">
            Group name
            <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="v2-field">
            Description
            <textarea required value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} />
          </label>
          <button className="rap-button w-full">Create group</button>
        </form>
      </Modal>
      {notice && (
        <button onClick={() => setNotice("")} className="v2-toast">
          {notice} · Dismiss
        </button>
      )}
    </div>
  );
}
export function Messenger() {
  /* Live: /conversations + messages */ const { user } = useAuth();
  const convs = useApi<any[]>("/conversations");
  const [who, setWho] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [msgs, setMsgs] = useState<any[]>([]);
  const [info, setInfo] = useState(false);
  const [err, setErr] = useState("");
  const list = (convs.data ?? []).filter((c: any) =>
    (c.other_participant?.full_name || "").toLowerCase().includes(q.toLowerCase()),
  );
  const cur = (convs.data ?? []).find((c: any) => c.id === who) || list[0];
  const name = cur?.other_participant?.full_name || "Member";
  useEffect(() => {
    const to = new URLSearchParams(window.location.search).get("to") || sessionStorage.getItem("rap-contact-id");
    if (to) {
      sessionStorage.removeItem("rap-contact-id");
      api
        .post("/conversations", { participant_id: to })
        .then((r) => {
          convs.reload();
          setWho(r.data.id);
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cur) return;
    let live = true;
    const load = () =>
      api
        .get(`/conversations/${cur.id}/messages`)
        .then((r) => live && setMsgs(r.data))
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    if (!draft.trim() || !cur) return;
    setErr("");
    try {
      const r = await api.post(`/conversations/${cur.id}/messages`, { content: draft.trim() });
      setMsgs((m) => [...m, r.data]);
      setDraft("");
      convs.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "Message not sent. Try again."));
    }
  };
  return (
    <div className="rap-panel flex overflow-hidden" style={{ height: "calc(100vh - 150px)", minHeight: 520 }}>
      <aside className="w-[290px] shrink-0 border-r border-slate-200 p-4 hidden md:block overflow-auto">
        <h1 className="!text-2xl mb-5">Chats</h1>
        <input
          aria-label="Search conversations"
          placeholder="Search messages"
          className="rounded-full bg-slate-100 px-4 py-2.5 w-full text-sm mb-4"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {list.map((c: any) => (
          <button
            key={c.id}
            onClick={() => setWho(c.id)}
            className={cx(
              "flex w-full items-center gap-3 p-3 rounded-lg text-left",
              cur?.id === c.id ? "bg-blue-50" : "hover:bg-slate-50",
            )}
          >
            <Av name={c.other_participant?.full_name || "Member"} s={44} />
            <div className="min-w-0 flex-1">
              <b className="text-sm">{c.other_participant?.full_name || "Member"}</b>
              <p className="text-xs text-slate-500 truncate mt-1">
                {c.last_message?.content || "Start a conversation"}
              </p>
            </div>
            {c.unread_count > 0 && (
              <span className="rounded-full bg-blue-600 px-2 text-xs font-bold text-white">{c.unread_count}</span>
            )}
          </button>
        ))}
        {!convs.loading && !list.length && (
          <p className="text-sm text-slate-500">
            No conversations yet. Message someone from{" "}
            <button className="font-semibold text-blue-600" onClick={() => go("network")}>
              your network
            </button>
            .
          </p>
        )}
      </aside>
      <section className="flex flex-1 flex-col min-w-0">
        {cur ? (
          <>
            <header className="flex items-center gap-3 p-5 border-b border-slate-200">
              <select
                aria-label="Switch conversation"
                value={cur.id}
                onChange={(e) => setWho(e.target.value)}
                className="md:hidden rounded-full bg-slate-100 px-3 py-2 text-xs max-w-[110px]"
              >
                {(convs.data ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.other_participant?.full_name || "Member"}
                  </option>
                ))}
              </select>
              <Av name={name} />
              <div className="flex-1">
                <b>{name}</b>
                <p className="text-xs text-slate-500">
                  {cur.other_participant?.headline || "Your professional network"}
                </p>
              </div>
              <button aria-label="Conversation details" onClick={() => setInfo(!info)} className="text-blue-600 p-2">
                <Ic n="user" />
              </button>
            </header>
            {info && (
              <div className="bg-blue-50 p-5 text-sm">
                <b>{name}</b>
                <p className="mt-1 text-slate-500">
                  Keep your conversations focused on professional opportunities and delivery.
                </p>
                {cur.other_participant?.engineer_profile_id && (
                  <button
                    className="mt-3 text-blue-600"
                    onClick={() => {
                      sessionStorage.setItem("rap-person-id", cur.other_participant.engineer_profile_id);
                      go("engineer");
                    }}
                  >
                    View profile →
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-auto p-6 space-y-5">
              {msgs.map((m: any) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                    <p
                      title={timeAgo(m.created_at)}
                      className={cx(
                        "max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line",
                        mine ? "bg-[#0866ff] text-white" : "bg-slate-100",
                      )}
                    >
                      {m.content}
                    </p>
                  </div>
                );
              })}
              {!msgs.length && <p className="text-center text-xs text-slate-400">No messages yet — say hello.</p>}
            </div>
            {err && (
              <p role="alert" className="px-5 text-sm text-red-600">
                {err}
              </p>
            )}
            <form
              className="p-5 flex gap-3 border-t border-slate-100"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input
                aria-label="Message"
                placeholder="Write a message…"
                value={draft}
                maxLength={10000}
                onChange={(e) => setDraft(e.target.value)}
                className="min-w-0 flex-1 rounded-full bg-slate-100 px-5 py-3"
              />
              <button aria-label="Send message" className="text-blue-600 p-3">
                <Ic n="send" s={24} />
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center text-slate-500">
            {convs.loading ? "Loading conversations…" : "Select a conversation or start one from your network."}
          </div>
        )}
      </section>
    </div>
  );
}
export function Notifications() {
  /* Live: /notifications */ const q = useApi<any[]>("/notifications");
  const [filter, setFilter] = useState("All");
  const [read, setRead] = useState<Record<string, boolean>>({});
  const rows = (q.data ?? []).map((n: any) => ({ ...n, read: n.is_read || read[n.id] }));
  const routeOf = (k: string) =>
    k === "message"
      ? "messenger"
      : k?.startsWith("connection")
        ? "network"
        : k?.startsWith("application")
          ? "applications"
          : k?.includes("contract")
            ? "contracts"
            : k?.includes("payment")
              ? "earnings"
              : "feed";
  const open = async (n: any) => {
    if (!n.read) {
      setRead((r) => ({ ...r, [n.id]: true }));
      api.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    go(routeOf(n.kind));
  };
  const readAll = async () => {
    await api.patch("/notifications/read-all").catch(() => {});
    setRead(Object.fromEntries(rows.map((n: any) => [n.id, true])));
  };
  return (
    <div className="max-w-[850px] mx-auto rap-panel p-6">
      <div className="flex justify-between items-center">
        <h1>Notifications</h1>
        <button className="text-blue-600 text-sm font-semibold" onClick={readAll}>
          Mark all as read
        </button>
      </div>
      <div className="flex gap-2 my-5">
        {["All", "Unread"].map((x) => (
          <button
            key={x}
            onClick={() => setFilter(x)}
            className={cx(
              "rounded-full px-4 py-2 text-sm font-semibold",
              filter === x ? "bg-blue-50 text-blue-600" : "hover:bg-slate-100",
            )}
          >
            {x}
          </button>
        ))}
      </div>
      <h3 className="mb-3">Recent</h3>
      {q.loading && <p className="text-sm text-slate-500">Loading…</p>}
      {rows
        .filter((x: any) => filter === "All" || !x.read)
        .map((x: any) => (
          <button
            key={x.id}
            onClick={() => open(x)}
            className={cx(
              "flex w-full items-center gap-4 rounded-lg p-4 text-left mb-1",
              !x.read ? "bg-blue-50/60" : "hover:bg-slate-50",
            )}
          >
            <Av name={x.title} s={50} />
            <div className="flex-1">
              <p className="text-sm">
                <b>{x.title}</b> {x.body}
              </p>
              <p className="text-xs text-blue-600 mt-1">{timeAgo(x.created_at)}</p>
            </div>
            {!x.read && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
          </button>
        ))}
      {!q.loading && !rows.some((x: any) => filter === "All" || !x.read) && (
        <div className="v2-empty">
          <Ic n="bell" s={36} c="mx-auto" />
          <h3>You’re all caught up</h3>
          <p>New notifications will appear here.</p>
        </div>
      )}
    </div>
  );
}

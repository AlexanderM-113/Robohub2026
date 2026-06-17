import { useEffect, useRef, useState, useCallback } from "react";
import { Hash, Lock, Send, Paperclip, X, Cpu, Wrench, Briefcase, Users2, Loader2, FileDown, Plus, Search, MessageCircle, Palette } from "lucide-react";
import { api, fileUrl, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const subIcons = { programming: Cpu, building: Wrench, business: Briefcase, team: Users2, design: Palette, general: MessageCircle };
const subKey = (id) => id.split("-").slice(1).join("-");
const initials = (n) => (n || "U").slice(0, 2).toUpperCase();

function MessageBubble({ msg, mine }) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`} data-testid="chat-message">
      <div className="flex items-baseline gap-2 mb-1 px-1">
        <span className="text-xs font-semibold">{mine ? "You" : msg.user_name}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{msg.user_role}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(msg.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
        {msg.text && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>}
        {msg.attachment && (
          <div className="mt-2">
            {msg.attachment.kind === "image" ? (
              <a href={fileUrl(msg.attachment.file_id)} target="_blank" rel="noreferrer">
                <img src={fileUrl(msg.attachment.file_id)} alt={msg.attachment.filename} className="rounded-lg max-h-52 border border-border/30" />
              </a>
            ) : (
              <a href={fileUrl(msg.attachment.file_id)} target="_blank" rel="noreferrer"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${mine ? "bg-white/15" : "bg-background"}`}>
                <FileDown className="h-4 w-4" />
                <span className="truncate">{msg.attachment.filename}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [selected, setSelected] = useState(null); // {kind:'channel', channel} | {kind:'dm', user}
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  // New DM dialog
  const [dmOpen, setDmOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const loadThreads = useCallback(() => {
    api.get("/dm/threads").then(({ data }) => setDmThreads(data)).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/channels").then(({ data }) => {
      setChannels(data);
      if (data.length) setSelected({ kind: "channel", channel: data[0] });
    });
    loadThreads();
  }, [loadThreads]);

  // search users (debounced)
  useEffect(() => {
    if (!dmOpen) return;
    const t = setTimeout(() => {
      api.get("/users/search", { params: { q: query } }).then(({ data }) => setResults(data)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, dmOpen]);

  const loadMessages = useCallback(async (sel) => {
    if (!sel) return;
    try {
      if (sel.kind === "channel") {
        const { data } = await api.get(`/channels/${sel.channel.id}/messages`);
        setMessages(data);
      } else {
        const { data } = await api.get(`/dm/${sel.user.id}/messages`);
        setMessages(data.messages);
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected);
    const interval = setInterval(() => loadMessages(selected), 4000);
    return () => clearInterval(interval);
  }, [selected, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/files/upload", form);
      setAttachment(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !attachment) || !selected) return;
    setSending(true);
    try {
      const url = selected.kind === "channel"
        ? `/channels/${selected.channel.id}/messages`
        : `/dm/${selected.user.id}/messages`;
      const { data } = await api.post(url, { text: text.trim(), attachment_file_id: attachment?.id || null });
      setMessages((m) => [...m, data]);
      setText("");
      setAttachment(null);
      if (selected.kind === "dm") loadThreads();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const startDm = (u) => {
    setSelected({ kind: "dm", user: { id: u.id, name: u.name, role: u.role } });
    setDmOpen(false);
    setQuery("");
    setResults([]);
  };

  const vex = channels.filter((c) => c.program === "vex");
  const frc = channels.filter((c) => c.program === "frc");
  const priv = channels.filter((c) => c.program === "private");

  const isActiveChannel = (id) => selected?.kind === "channel" && selected.channel.id === id;
  const isActiveDm = (uid) => selected?.kind === "dm" && selected.user.id === uid;

  const ChannelButton = ({ c }) => {
    const Icon = c.private ? Lock : subIcons[subKey(c.id)] || Hash;
    return (
      <button data-testid={`channel-${c.id}`} onClick={() => setSelected({ kind: "channel", channel: c })}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActiveChannel(c.id) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{c.name}</span>
      </button>
    );
  };

  return (
    <div className="flex h-[calc(100vh-5rem)]" data-testid="chat-page">
      {/* Channel sidebar */}
      <div className="w-60 shrink-0 border-r border-border bg-card/50 overflow-y-auto p-4 space-y-6">
        <div>
          <p className="px-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">VEX</p>
          <div className="space-y-0.5">{vex.map((c) => <ChannelButton key={c.id} c={c} />)}</div>
        </div>
        <div>
          <p className="px-2 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">FRC</p>
          <div className="space-y-0.5">{frc.map((c) => <ChannelButton key={c.id} c={c} />)}</div>
        </div>
        {priv.length > 0 && (
          <div>
            <p className="px-2 mb-2 text-xs font-bold uppercase tracking-wider text-secondary">Private</p>
            <div className="space-y-0.5">{priv.map((c) => <ChannelButton key={c.id} c={c} />)}</div>
          </div>
        )}
        {/* Direct messages */}
        <div>
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Direct Messages</p>
            <Dialog open={dmOpen} onOpenChange={setDmOpen}>
              <DialogTrigger asChild>
                <button data-testid="dm-new-button" className="text-muted-foreground hover:text-primary" aria-label="New direct message">
                  <Plus className="h-4 w-4" />
                </button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader><DialogTitle className="font-heading">New Direct Message</DialogTitle></DialogHeader>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a person's name..."
                    className="rounded-xl h-11 pl-9" data-testid="dm-search-input" />
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1 mt-1">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No people found.</p>
                  ) : results.map((u) => (
                    <button key={u.id} onClick={() => startDm(u)} data-testid={`dm-user-result-${u.id}`}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-left">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials(u.name)}</AvatarFallback></Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.name}</p>
                        <p className="text-xs text-muted-foreground truncate capitalize">{u.role} · {u.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="space-y-0.5">
            {dmThreads.length === 0 && <p className="px-3 text-xs text-muted-foreground">No conversations yet.</p>}
            {dmThreads.map((t) => (
              <button key={t.user_id} data-testid={`dm-thread-${t.user_id}`} onClick={() => setSelected({ kind: "dm", user: { id: t.user_id, name: t.name, role: t.role } })}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActiveDm(t.user_id) ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <Avatar className="h-6 w-6 shrink-0"><AvatarFallback className="bg-muted-foreground/20 text-[10px] font-semibold">{initials(t.name)}</AvatarFallback></Avatar>
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 border-b border-border flex items-center px-6 gap-2.5 shrink-0">
          {selected?.kind === "dm" ? (
            <>
              <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials(selected.user.name)}</AvatarFallback></Avatar>
              <div>
                <p className="font-heading font-semibold leading-tight" data-testid="active-channel-name">{selected.user.name}</p>
                <p className="text-xs text-muted-foreground">Private conversation · just the two of you</p>
              </div>
            </>
          ) : (
            <>
              {selected?.channel?.private ? <Lock className="h-5 w-5 text-secondary" /> : <Hash className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-heading font-semibold leading-tight" data-testid="active-channel-name">{selected?.channel?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected?.channel?.private ? "Members only — mentors can't see this" : `${selected?.channel?.program_label || ""} channel`}
                </p>
              </div>
            </>
          )}
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="py-6 space-y-5 max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-20">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} msg={m} mine={m.user_id === user?.id} />)
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <form onSubmit={send} className="border-t border-border p-4 shrink-0">
          <div className="max-w-3xl mx-auto">
            {attachment && (
              <div className="flex items-center gap-2 mb-2 text-sm bg-muted rounded-lg px-3 py-2 w-fit" data-testid="chat-attachment-chip">
                <Paperclip className="h-4 w-4" />
                <span className="truncate max-w-[200px]">{attachment.original_filename}</span>
                <button type="button" onClick={() => setAttachment(null)}><X className="h-4 w-4" /></button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} data-testid="chat-file-input" />
              <Button type="button" variant="outline" size="icon" className="rounded-xl shrink-0"
                onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="chat-attach-button">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Input value={text} onChange={(e) => setText(e.target.value)}
                placeholder={selected?.kind === "dm" ? `Message ${selected.user.name}` : `Message ${selected?.channel?.name || ""}`}
                className="rounded-xl h-11" data-testid="chat-input" />
              <Button type="submit" size="icon" className="rounded-xl shrink-0 h-11 w-11" disabled={sending} data-testid="chat-send-button">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

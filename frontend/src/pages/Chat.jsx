import { useEffect, useRef, useState, useCallback } from "react";
import { Hash, Lock, Send, Paperclip, X, Cpu, Wrench, Briefcase, Users2, Loader2, FileDown } from "lucide-react";
import { api, fileUrl, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const subIcons = {
  programming: Cpu,
  building: Wrench,
  business: Briefcase,
  team: Users2,
};

function subKey(id) {
  return id.split("-").slice(1).join("-");
}

function MessageBubble({ msg, mine }) {
  const Icon = msg.attachment?.kind === "image";
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
                <img src={fileUrl(msg.attachment.file_id)} alt={msg.attachment.filename}
                  className="rounded-lg max-h-52 border border-border/30" />
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
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get("/channels").then(({ data }) => {
      setChannels(data);
      if (data.length) setActive(data[0].id);
    });
  }, []);

  const loadMessages = useCallback(async (channelId) => {
    if (!channelId) return;
    try {
      const { data } = await api.get(`/channels/${channelId}/messages`);
      setMessages(data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    loadMessages(active);
    const interval = setInterval(() => loadMessages(active), 4000);
    return () => clearInterval(interval);
  }, [active, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    if (!text.trim() && !attachment) return;
    setSending(true);
    try {
      const { data } = await api.post(`/channels/${active}/messages`, {
        text: text.trim(),
        attachment_file_id: attachment?.id || null,
      });
      setMessages((m) => [...m, data]);
      setText("");
      setAttachment(null);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not send");
    } finally {
      setSending(false);
    }
  };

  const vex = channels.filter((c) => c.program === "vex");
  const frc = channels.filter((c) => c.program === "frc");
  const priv = channels.filter((c) => c.program === "private");
  const activeChannel = channels.find((c) => c.id === active);

  const ChannelButton = ({ c }) => {
    const Icon = c.private ? Lock : subIcons[subKey(c.id)] || Hash;
    return (
      <button
        data-testid={`channel-${c.id}`}
        onClick={() => setActive(c.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
          active === c.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
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
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-16 border-b border-border flex items-center px-6 gap-2.5 shrink-0">
          {activeChannel?.private ? <Lock className="h-5 w-5 text-secondary" /> : <Hash className="h-5 w-5 text-muted-foreground" />}
          <div>
            <p className="font-heading font-semibold leading-tight" data-testid="active-channel-name">{activeChannel?.name}</p>
            <p className="text-xs text-muted-foreground">
              {activeChannel?.private ? "Members only — mentors can't see this" : `${activeChannel?.program_label} channel`}
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="py-6 space-y-5 max-w-3xl mx-auto">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-20">
                <Hash className="h-10 w-10 mx-auto mb-3 opacity-40" />
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
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${activeChannel?.name || ""}`}
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

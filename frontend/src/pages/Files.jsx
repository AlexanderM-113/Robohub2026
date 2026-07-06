import { useEffect, useState, useRef } from "react";
import { Upload, Image as ImageIcon, FileCode2, FileArchive, Trash2, Download, Loader2, FolderOpen } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { getFileDownloadUrl, getFilePreviewObjectUrl } from "@/lib/fileAccess";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

function fmtSize(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const kindIcon = { image: ImageIcon, code: FileCode2, zip: FileArchive };

export default function Files() {
  const { user } = useAuth();
  const [files, setFiles] = useState([]);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState({});
  const [downloadUrls, setDownloadUrls] = useState({});
  const fileRef = useRef(null);
  const previewUrlRef = useRef({});
  const previewObjectUrlsRef = useRef([]);

  const load = () => api.get("/files").then(({ data }) => setFiles(data)).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => () => {
    previewObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const previewUpdates = {};
      const downloadUpdates = {};
      for (const f of files) {
        if (f.kind === "image" && !previewUrlRef.current[f.id]) {
          try {
            const url = await getFilePreviewObjectUrl(f.id);
            if (cancelled) {
              URL.revokeObjectURL(url);
              return;
            }
            previewUrlRef.current[f.id] = url;
            previewObjectUrlsRef.current.push(url);
            previewUpdates[f.id] = url;
          } catch {
            // ignore
          }
        }
        if (!downloadUrls[f.id]) {
          try {
            downloadUpdates[f.id] = await getFileDownloadUrl(f.id);
          } catch {
            // ignore
          }
        }
      }
      if (cancelled) return;
      if (Object.keys(previewUpdates).length) {
        setPreviewUrls((prev) => ({ ...prev, ...previewUpdates }));
      }
      if (Object.keys(downloadUpdates).length) {
        setDownloadUrls((prev) => ({ ...prev, ...downloadUpdates }));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [files, downloadUrls]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/files/upload", form);
      toast.success("File uploaded");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/files/${id}`);
      toast.success("File removed");
      setFiles((f) => f.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Delete failed");
    }
  };

  const visible = filter === "all" ? files : files.filter((f) => f.kind === filter);
  const images = visible.filter((f) => f.kind === "image");
  const docs = visible.filter((f) => f.kind !== "image");
  const canDelete = (f) => f.uploaded_by === user?.id || ["owner", "mentor"].includes(user?.role);

  return (
    <div className="max-w-7xl mx-auto p-6 lg:p-8 space-y-8" data-testid="files-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Shared Files</h1>
          <p className="text-muted-foreground mt-1">Images, code, and zip archives for the whole team.</p>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} data-testid="files-upload-input" />
        <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl h-11 gap-2" data-testid="files-upload-button">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload File
        </Button>
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="rounded-xl">
          <TabsTrigger value="all" className="rounded-lg" data-testid="filter-all">All</TabsTrigger>
          <TabsTrigger value="image" className="rounded-lg" data-testid="filter-image">Images</TabsTrigger>
          <TabsTrigger value="code" className="rounded-lg" data-testid="filter-code">Code</TabsTrigger>
          <TabsTrigger value="zip" className="rounded-lg" data-testid="filter-zip">Archives</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 && (
        <div className="text-center text-muted-foreground py-24 border border-dashed border-border rounded-2xl">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No files here yet. Upload one to get started.</p>
        </div>
      )}

      {/* Image gallery */}
      {images.length > 0 && (
        <div>
          <h2 className="font-heading text-lg font-semibold mb-4">Images</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {images.map((f) => (
              <Card key={f.id} className="overflow-hidden rounded-2xl group" data-testid={`file-${f.id}`}>
                <a href={downloadUrls[f.id] || previewUrls[f.id] || "#"} target="_blank" rel="noreferrer" className="block aspect-video bg-muted overflow-hidden">
                  {previewUrls[f.id] ? (
                    <img src={previewUrls[f.id]} alt={f.original_filename} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">Loading preview...</div>
                  )}
                </a>
                <div className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.original_filename}</p>
                    <p className="text-xs text-muted-foreground">{f.uploader_name} · {fmtSize(f.size)}</p>
                  </div>
                  {canDelete(f) && (
                    <button onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive shrink-0" data-testid={`delete-${f.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Documents list */}
      {docs.length > 0 && (
        <div>
          <h2 className="font-heading text-lg font-semibold mb-4">Code & Archives</h2>
          <div className="space-y-3">
            {docs.map((f) => {
              const Icon = kindIcon[f.kind] || FileCode2;
              return (
                <Card key={f.id} className="p-4 rounded-2xl flex items-center gap-4" data-testid={`file-${f.id}`}>
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${f.kind === "zip" ? "bg-secondary/15 text-secondary" : "bg-primary/10 text-primary"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{f.original_filename}</p>
                    <p className="text-xs text-muted-foreground">{f.uploader_name} · {fmtSize(f.size)}</p>
                  </div>
                  <a href={downloadUrls[f.id] || "#"} target="_blank" rel="noreferrer" download
                    className="text-muted-foreground hover:text-primary" data-testid={`download-${f.id}`}>
                    <Download className="h-5 w-5" />
                  </a>
                  {canDelete(f) && (
                    <button onClick={() => remove(f.id)} className="text-muted-foreground hover:text-destructive" data-testid={`delete-${f.id}`}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

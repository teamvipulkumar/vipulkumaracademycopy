import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload, Search, Trash2, Copy, Check, FileText, Film, File, ImageIcon,
  Loader2, AlertCircle, X, Eye, ChevronLeft, ChevronRight, Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type MediaFile = {
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
  mimetype: string;
  type: "image" | "video" | "document" | "other";
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function FileIcon({ type, mimetype }: { type: string; mimetype: string }) {
  if (type === "video") return <Film className="w-10 h-10 text-blue-400" />;
  if (type === "document" || mimetype === "application/pdf") return <FileText className="w-10 h-10 text-red-400" />;
  return <File className="w-10 h-10 text-muted-foreground" />;
}

const TYPE_TABS = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
  { key: "document", label: "Documents" },
] as const;

export default function AdminFilesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video" | "document">("all");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

  const { data: files = [], isLoading } = useQuery<MediaFile[]>({
    queryKey: ["admin-files"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/upload/admin/files`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = files.filter(f => {
    const matchesType = typeFilter === "all" || f.type === typeFilter;
    const matchesSearch = f.filename.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const copyUrl = useCallback((file: MediaFile) => {
    const fullUrl = /^https?:\/\//i.test(file.url) ? file.url : `${API_BASE}${file.url}`;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedFile(file.filename);
      setTimeout(() => setCopiedFile(null), 2000);
    });
  }, []);

  const deleteFile = useCallback(async (file: MediaFile) => {
    if (!confirm(`Delete "${file.filename}"? This cannot be undone.`)) return;
    setDeletingFile(file.filename);
    try {
      const res = await fetch(`${API_BASE}/api/upload/admin/files/${file.filename}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      queryClient.invalidateQueries({ queryKey: ["admin-files"] });
      toast({ title: "File deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeletingFile(null);
    }
  }, [queryClient, toast]);

  const uploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(null);
    setUploading(true);
    let successCount = 0;
    let errorCount = 0;
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch(`${API_BASE}/api/upload/file`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
        successCount++;
      } catch (err: any) {
        errorCount++;
        setUploadError(err.message ?? "Upload failed");
      }
    }
    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ["admin-files"] });
    if (successCount > 0) toast({ title: `${successCount} file${successCount > 1 ? "s" : ""} uploaded` });
    if (errorCount > 0) toast({ title: `${errorCount} upload${errorCount > 1 ? "s" : ""} failed`, variant: "destructive" });
    if (inputRef.current) inputRef.current.value = "";
  }, [queryClient, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    uploadFiles(e.dataTransfer.files);
  }, [uploadFiles]);

  const counts = {
    all: files.length,
    image: files.filter(f => f.type === "image").length,
    video: files.filter(f => f.type === "video").length,
    document: files.filter(f => f.type === "document").length,
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Upload and manage all your media files</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => inputRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,image/svg+xml,.svg,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            className="hidden"
            onChange={e => uploadFiles(e.target.files)}
          />
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-auto cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Drop zone (when no files) */}
      {!isLoading && files.length === 0 && (
        <div
          className="border-2 border-dashed border-border rounded-xl p-16 text-center text-muted-foreground hover:border-primary/50 transition-colors cursor-pointer"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
          <p className="font-medium text-foreground mb-1">Drop files here or click to upload</p>
          <p className="text-sm">Images, Videos, PDFs, Documents — up to 50 MB per file</p>
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex gap-1 p-1 bg-card border border-border rounded-lg overflow-x-auto scrollbar-hide w-full sm:w-auto">
              {TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setTypeFilter(tab.key as typeof typeFilter)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0 whitespace-nowrap ${typeFilter === tab.key ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab.label}
                  <span className={`text-xs ${typeFilter === tab.key ? "text-white" : "text-muted-foreground"}`}>
                    {counts[tab.key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search files…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-square bg-card rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              No files found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.map(file => (
                <div key={file.filename} className="group relative bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-all duration-200">
                  {/* Preview area */}
                  <div className="aspect-square bg-card/50 flex items-center justify-center overflow-hidden">
                    {file.type === "image" ? (
                      <img
                        src={/^https?:\/\//i.test(file.url) ? file.url : `${API_BASE}${file.url}`}
                        alt={file.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <FileIcon type={file.type} mimetype={file.mimetype} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 border-t border-border">
                    <p className="text-xs font-medium truncate text-foreground">{file.filename}</p>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(file.uploadedAt)}</span>
                    </div>
                  </div>

                  {/* Hover actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                    <Badge variant="secondary" className="text-[10px] capitalize mb-1">{file.type}</Badge>
                    {file.type === "image" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full h-7 text-xs gap-1"
                        onClick={() => setPreviewFile(file)}
                      >
                        <Eye className="w-3 h-3" />View
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full h-7 text-xs gap-1"
                      onClick={() => copyUrl(file)}
                    >
                      {copiedFile === file.filename
                        ? <><Check className="w-3 h-3" />Copied!</>
                        : <><Copy className="w-3 h-3" />Copy URL</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="w-full h-7 text-xs gap-1"
                      disabled={deletingFile === file.filename}
                      onClick={() => deleteFile(file)}
                    >
                      {deletingFile === file.filename
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <><Trash2 className="w-3 h-3" />Delete</>}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-6">
              Showing {filtered.length} of {files.length} files
            </p>
          )}
        </>
      )}

      {/* Lightbox */}
      {previewFile && (() => {
        const images = filtered.filter(f => f.type === "image");
        const idx = images.findIndex(f => f.filename === previewFile.filename);
        const prev = idx > 0 ? images[idx - 1] : null;
        const next = idx < images.length - 1 ? images[idx + 1] : null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setPreviewFile(null)}
          >
            {/* Close */}
            <button
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              onClick={() => setPreviewFile(null)}
            >
              <X className="w-5 h-5" />
            </button>

            {/* Prev */}
            {prev && (
              <button
                className="absolute left-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                onClick={e => { e.stopPropagation(); setPreviewFile(prev); }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Next */}
            {next && (
              <button
                className="absolute right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                onClick={e => { e.stopPropagation(); setPreviewFile(next); }}
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Image */}
            <div
              className="flex flex-col items-center"
              style={{ maxWidth: "92vw" }}
              onClick={e => e.stopPropagation()}
            >
              <img
                src={/^https?:\/\//i.test(previewFile.url) ? previewFile.url : `${API_BASE}${previewFile.url}`}
                alt={previewFile.filename}
                className="rounded-xl shadow-2xl"
                style={{
                  maxWidth: "92vw",
                  maxHeight: "82vh",
                  width: "auto",
                  height: "auto",
                  display: "block",
                  imageRendering: "auto",
                }}
              />
              {/* Footer bar */}
              <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 w-full max-w-lg" style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{previewFile.filename}</p>
                  <p className="text-xs text-white/50">{formatBytes(previewFile.size)} · {formatDate(previewFile.uploadedAt)}</p>
                </div>
                <a
                  href={/^https?:\/\//i.test(previewFile.url) ? previewFile.url : `${API_BASE}${previewFile.url}`}
                  download={previewFile.filename}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3.5 h-3.5" />Download
                </a>
                <button
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  onClick={e => { e.stopPropagation(); copyUrl(previewFile); }}
                >
                  {copiedFile === previewFile.filename
                    ? <><Check className="w-3.5 h-3.5" />Copied!</>
                    : <><Copy className="w-3.5 h-3.5" />Copy URL</>}
                </button>
              </div>
              {images.length > 1 && (
                <p className="text-xs text-white/30 mt-2">{idx + 1} / {images.length}</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

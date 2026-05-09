import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Upload, Check, Loader2, AlertCircle, ImageIcon, Film, FileText, File, Maximize2, X,
} from "lucide-react";

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

function FileThumb({ file }: { file: MediaFile }) {
  if (file.type === "image") {
    return (
      <img
        src={/^https?:\/\//i.test(file.url) ? file.url : `${API_BASE}${file.url}`}
        alt={file.filename}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  const Icon = file.type === "video" ? Film : file.type === "document" ? FileText : File;
  const color = file.type === "video" ? "text-blue-400" : file.type === "document" ? "text-red-400" : "text-muted-foreground";
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Icon className={`w-8 h-8 ${color}`} />
    </div>
  );
}

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  accept?: "image" | "video" | "document" | "all";
  title?: string;
}

export function MediaPicker({
  open,
  onClose,
  onSelect,
  accept = "all",
  title = "Media Library",
}: MediaPickerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadDrag, setUploadDrag] = useState(false);
  // Lightbox preview state — full-size view for any file (image preview for
  // images, icon + filename card for non-images).
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);

  const { data: files = [], isLoading } = useQuery<MediaFile[]>({
    queryKey: ["admin-files"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/upload/admin/files`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const filtered = files.filter(f => {
    const matchesType = accept === "all" || f.type === accept;
    const matchesSearch = f.filename.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleSelect = () => {
    if (!selected) return;
    onSelect(/^https?:\/\//i.test(selected) ? selected : `${API_BASE}${selected}`);
    setSelected(null);
    onClose();
  };

  const uploadFile = useCallback(async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload/file`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["admin-files"] });
      const url: string = data.url ?? "";
      onSelect(/^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`);
      setSelected(null);
      onClose();
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [queryClient, onSelect, onClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const acceptAttr = accept === "image" ? "image/*"
    : accept === "video" ? "video/*"
    : accept === "document" ? "application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
    : "image/*,video/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx";

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) { setSelected(null); setPreviewFile(null); onClose(); } }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="library" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-6 mt-4 mb-2 self-start flex-shrink-0">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload New</TabsTrigger>
          </TabsList>

          {/* Library tab */}
          <TabsContent value="library" className="flex flex-col flex-1 min-h-0 px-6 pb-6 mt-0">
            <div className="relative mb-4 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search files…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {isLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="aspect-square bg-card rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No files found. Upload something first.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {filtered.map(file => {
                    const isSelected = selected === file.url;
                    return (
                      <div
                        key={file.filename}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-150 bg-card group ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/50"}`}
                      >
                        {/* Main select button — fills the tile */}
                        <button
                          type="button"
                          onClick={() => setSelected(isSelected ? null : file.url)}
                          className="absolute inset-0 cursor-pointer"
                          aria-label={isSelected ? "Deselect file" : "Select file"}
                        >
                          <FileThumb file={file} />
                        </button>

                        {/* Selected overlay (decorative, clicks pass through) */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                          </div>
                        )}

                        {/* Filename ribbon (decorative) */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <p className="text-[10px] text-white truncate">{file.filename}</p>
                          <p className="text-[9px] text-white/60">{formatBytes(file.size)}</p>
                        </div>

                        {/* Expand-to-full-view button — top-right corner.
                            Stops propagation so it never toggles selection. */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setPreviewFile(file); }}
                          className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-md bg-black/60 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer backdrop-blur-sm"
                          aria-label="View full size"
                          title="View full size"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border mt-4 flex-shrink-0">
              <p className="text-xs text-muted-foreground">
                {selected ? "1 file selected" : `${filtered.length} file${filtered.length !== 1 ? "s" : ""}`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setSelected(null); onClose(); }}>Cancel</Button>
                <Button size="sm" disabled={!selected} onClick={handleSelect} className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />Select
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Upload tab */}
          <TabsContent value="upload" className="flex-1 min-h-0 px-6 pb-6 mt-0">
            <div
              className={`relative border-2 border-dashed rounded-xl h-64 flex flex-col items-center justify-center gap-4 text-muted-foreground transition-colors cursor-pointer ${uploadDrag ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-primary/5"}`}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setUploadDrag(true); }}
              onDragLeave={() => setUploadDrag(false)}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm font-medium text-primary">Uploading…</p>
                </>
              ) : (
                <>
                  <div className={`p-4 rounded-2xl transition-colors ${uploadDrag ? "bg-primary/20" : "bg-card"}`}>
                    <Upload className={`w-8 h-8 transition-colors ${uploadDrag ? "text-primary" : "text-muted-foreground/50"}`} />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground text-sm">
                      {uploadDrag ? "Drop to upload" : "Click or drag & drop to upload"}
                    </p>
                    <p className="text-xs mt-1">Images, Videos, PDFs, Documents · Max 50 MB</p>
                  </div>
                </>
              )}
            </div>

            {uploadError && (
              <div className="flex items-center gap-2 text-red-400 text-sm mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              className="hidden"
              onChange={handleFileChange}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* ── Lightbox preview — full-size view of any file ── */}
    <Dialog open={!!previewFile} onOpenChange={v => !v && setPreviewFile(null)}>
      <DialogContent
        className="max-w-[95vw] w-fit p-0 gap-0 overflow-hidden bg-black/95 border-border"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{previewFile?.filename ?? "File preview"}</DialogTitle>
        </DialogHeader>
        {previewFile && (() => {
          const fullUrl = /^https?:\/\//i.test(previewFile.url)
            ? previewFile.url
            : `${API_BASE}${previewFile.url}`;
          return (
            <div className="relative flex flex-col items-center justify-center">
              {/* Close button */}
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center cursor-pointer backdrop-blur-sm transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Body — image / video / generic file card */}
              {previewFile.type === "image" ? (
                <img
                  src={fullUrl}
                  alt={previewFile.filename}
                  className="max-w-[90vw] max-h-[80vh] object-contain"
                />
              ) : previewFile.type === "video" ? (
                <video
                  src={fullUrl}
                  controls
                  className="max-w-[90vw] max-h-[80vh] bg-black"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 px-12 py-16 min-w-[320px]">
                  {previewFile.type === "document" ? (
                    <FileText className="w-20 h-20 text-red-400" />
                  ) : (
                    <File className="w-20 h-20 text-muted-foreground" />
                  )}
                  <p className="text-sm text-white/80 text-center break-all max-w-md">{previewFile.filename}</p>
                  <a
                    href={fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Open in new tab
                  </a>
                </div>
              )}

              {/* Footer — filename + size + Use This File shortcut */}
              <div className="w-full px-4 py-3 bg-black/80 border-t border-white/10 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/80 truncate" title={previewFile.filename}>
                    {previewFile.filename}
                  </p>
                  <p className="text-[10px] text-white/50">{formatBytes(previewFile.size)}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onSelect(fullUrl);
                    setSelected(null);
                    setPreviewFile(null);
                    onClose();
                  }}
                  className="gap-1.5 cursor-pointer flex-shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />Use This File
                </Button>
              </div>
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}

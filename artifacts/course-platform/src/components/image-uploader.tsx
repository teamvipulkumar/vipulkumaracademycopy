import { useRef, useState, useCallback } from "react";
import { ImageIcon, Upload, X, Loader2, AlertCircle, FolderOpen } from "lucide-react";
import { MediaPicker } from "@/components/media-picker";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  aspectRatio?: "video" | "square" | "banner";
  className?: string;
  /** Hide the "From Library" media-picker option — useful for end-user uploads
   *  (e.g. Creator KYC) where the shared media library is irrelevant and the
   *  user should only upload from their own device. */
  hideLibrary?: boolean;
}

const ASPECT: Record<string, string> = {
  video: "aspect-video",
  square: "aspect-square",
  banner: "aspect-[16/5]",
};

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function ImageUploader({
  value,
  onChange,
  label = "Image",
  hint = "Recommended: 1280×720px · JPG, PNG, WebP · Max 10MB",
  aspectRatio = "video",
  className = "",
  hideLibrary = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }

      const data = await res.json();
      // Backend now returns absolute Supabase Storage URLs, so we use them as-is.
      // Fall back to API_BASE prefix for any legacy `/api/files/...` response.
      const url: string = data.url ?? "";
      onChange(/^https?:\/\//i.test(url) ? url : `${API_BASE}${url}`);
    } catch (err: any) {
      setError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (JPEG, PNG, WebP, GIF).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10 MB.");
      return;
    }
    uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-sm font-medium block">{label}</label>}

      {/* Drop zone / preview */}
      <div
        className={`relative rounded-xl border-2 transition-all duration-150 overflow-hidden group ${ASPECT[aspectRatio]}
          ${dragOver ? "border-primary bg-primary/10 scale-[1.01]" : "border-dashed border-border hover:border-primary/50 hover:bg-primary/5"}
          ${value ? "border-solid border-border cursor-default" : "cursor-pointer"}
        `}
        onClick={() => { if (!uploading && !value) inputRef.current?.click(); }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {value ? (
          <>
            <img
              src={value}
              alt="Thumbnail preview"
              className="w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-150 flex items-center justify-center gap-3">
              {!hideLibrary && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPickerOpen(true); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2 text-white text-xs font-medium hover:bg-white/30 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />Library
                </button>
              )}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2 text-white text-xs font-medium hover:bg-white/30 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />Upload
              </button>
            </div>
            {/* Remove button */}
            <button
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80 z-10 cursor-pointer"
              onClick={e => { e.stopPropagation(); onChange(""); }}
              title="Remove image"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            {uploading ? (
              <>
                <Loader2 className="w-9 h-9 animate-spin text-primary" />
                <span className="text-sm font-medium text-primary">Uploading…</span>
              </>
            ) : (
              <>
                <div className={`rounded-2xl p-4 transition-colors ${dragOver ? "bg-primary/20" : "bg-background/60"}`}>
                  <ImageIcon className={`w-8 h-8 transition-colors ${dragOver ? "text-primary" : "text-muted-foreground/50"}`} />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-medium text-foreground mb-2">
                    {dragOver ? "Drop to upload" : "Add an image"}
                  </p>
                  {!dragOver && (
                    <div className="flex items-center gap-2 justify-center">
                      {!hideLibrary && (
                        <>
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setPickerOpen(true); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
                          >
                            <FolderOpen className="w-3 h-3" />From Library
                          </button>
                          <span className="text-xs text-muted-foreground">or</span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors flex items-center gap-1.5 font-medium text-foreground cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />Upload from device
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Uploading overlay when already has image */}
        {uploading && value && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
              <span className="text-sm text-white font-medium">Uploading…</span>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Hint */}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={url => { onChange(url); setPickerOpen(false); }}
        accept="image"
        title="Select Image from Library"
      />
    </div>
  );
}

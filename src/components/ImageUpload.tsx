import { useState, useRef } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  currentUrl?: string | null;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => void;
  uploading?: boolean;
}

export default function ImageUpload({ currentUrl, onUpload, onRemove, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5MB");
      return;
    }

    setPreview(URL.createObjectURL(file));
    onUpload(file).catch((err) => {
      setError(err?.message || "Upload failed");
      setPreview(null);
    });
  }

  function handleRemove() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onRemove?.();
  }

  const displayUrl = preview || currentUrl;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {displayUrl ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border">
            <img
              src={displayUrl}
              alt="Preview"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "";
              }}
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 shadow"
              disabled={uploading}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/30">
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Uploading\u2026" : displayUrl ? "Change" : "Upload"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}

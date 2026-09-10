import { useCallback } from "react";
import type { Attachment } from "../types";

export function useChatAttachments(
  setPending: React.Dispatch<React.SetStateAction<Attachment[]>>,
  setError: (e: string | null) => void,
  t: (k: string) => string,
) {
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const f of arr) {
      const isImage = f.type.startsWith("image/");
      const isText =
        f.name.endsWith(".md") ||
        f.name.endsWith(".txt") ||
        f.name.endsWith(".markdown") ||
        f.type === "text/plain" ||
        f.type === "text/markdown";
      if (!isImage && !isText) {
        if (f.size > 2 * 1024 * 1024) {
          setError(t("chat.errorFileNotSupported").replace("{name}", f.name));
          continue;
        }
      }
      if (isImage) {
        if (f.size > 6 * 1024 * 1024) {
          setError(t("chat.errorImageTooLarge").replace("{name}", f.name));
          continue;
        }
        const dataUrl: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(new Error("read failed"));
          r.readAsDataURL(f);
        });
        setPending((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), name: f.name, type: "image", size: f.size, dataUrl, preview: dataUrl },
        ]);
      } else {
        if (f.size > 1 * 1024 * 1024) {
          setError(t("chat.errorFileTooLarge").replace("{name}", f.name));
          continue;
        }
        const text: string = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(new Error("read failed"));
          r.readAsText(f);
        });
        const truncated = text.slice(0, 50000);
        setPending((prev) => [
          ...prev,
          { id: Math.random().toString(36).slice(2), name: f.name, type: "text", size: f.size, text: truncated },
        ]);
      }
    }
  }, [setPending, setError, t]);

  const remove = useCallback((id: string) => setPending((prev) => prev.filter((a) => a.id !== id)), [setPending]);
  const clear = useCallback(() => setPending([]), [setPending]);

  return { handleFiles, removeAttachment: remove, clearAttachments: clear };
}

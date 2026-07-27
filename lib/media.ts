"use client";

import { MAX_MEDIA_BYTES, type Media } from "../shared/protocol";

const PARTY_HOST = process.env.NEXT_PUBLIC_PARTY_HOST || "127.0.0.1:8787";
const isLocal = /^(127\.|localhost|0\.0\.0\.0)/.test(PARTY_HOST);
const BASE = `${isLocal ? "http" : "https"}://${PARTY_HOST}`;

export interface UploadedMedia {
  key: string;
  media: Media;
  contentType: string;
}

export function mediaUrl(key: string): string {
  return `${BASE}/media/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function mediaLimitLabel(): string {
  return `${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB`;
}

/**
 * Send the file straight to the Worker, which streams it into R2.
 *
 * `XMLHttpRequest` rather than `fetch` purely for upload progress — `fetch`
 * still can't report it in browsers, and a silent 40 MB video upload feels
 * broken.
 */
export function uploadMedia(
  slug: string,
  clueId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<UploadedMedia> {
  if (file.size > MAX_MEDIA_BYTES) {
    return Promise.reject(new Error(`that file is too big — the limit is ${mediaLimitLabel()}`));
  }
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return Promise.reject(new Error("pick an image or a video"));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/upload/${encodeURIComponent(slug)}/${encodeURIComponent(clueId)}`);
    xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: { key?: string; media?: Media; contentType?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* fall through to the status-based message below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.key && body.media) {
        resolve({ key: body.key, media: body.media, contentType: body.contentType ?? file.type });
      } else {
        reject(new Error(body.error ?? `upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("upload failed — is the room server reachable?"));
    xhr.send(file);
  });
}

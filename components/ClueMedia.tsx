"use client";

import { mediaUrl } from "../lib/media";
import type { Media } from "../shared/protocol";

/**
 * A clue's image or video, letterboxed into a fixed box.
 *
 * Sizing is `width/height: 100%` plus `object-fit: contain`, deliberately not
 * `max-width/max-height: 100%`. The percentage version looks equivalent but
 * fails wherever the surrounding box is a shrinkable flex item: its height is
 * not definite at the point the percentage resolves, so `max-height` computes
 * to `none`, the picture renders at full height and the bottom is clipped.
 * `object-fit` needs no percentage resolution and letterboxes correctly in
 * every container.
 */
export function ClueMedia({
  media,
  mediaKey,
  label,
  height,
  autoPlay = false,
  controls = true,
  border = "#2a3244",
}: {
  media: Media;
  mediaKey: string;
  label?: string;
  /** Any CSS height — the media is contained within it, never cropped. */
  height: string | number;
  autoPlay?: boolean;
  controls?: boolean;
  border?: string;
}) {
  const fill: React.CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
  };

  return (
    <div
      style={{
        // Never shrink below the requested height — shrinking is what breaks
        // percentage sizing on the child in the first place.
        flex: "0 0 auto",
        height,
        width: "100%",
        minHeight: 0,
        background: "#05070c",
        border: `1px solid ${border}`,
        overflow: "hidden",
      }}
    >
      {media === "video" ? (
        <video
          key={mediaKey}
          src={mediaUrl(mediaKey)}
          autoPlay={autoPlay}
          controls={controls}
          playsInline
          style={fill}
        />
      ) : (
        <img key={mediaKey} src={mediaUrl(mediaKey)} alt={label || ""} style={fill} />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { C } from "../lib/theme";
import { mediaUrl } from "../lib/media";
import type { Media } from "../shared/protocol";

/**
 * A clue's image or video, sized to its own shape.
 *
 * The frame used to be a fixed box with the picture letterboxed inside it, which
 * is right for a 16:9 still and wrong for everything else: a phone photo or a
 * portrait clip sat in a slab of dead space with the actual subject shrunk into
 * a strip down the middle. On a TV across a room that is the difference between
 * a clue people can read and one they cannot.
 *
 * So the frame takes the media's *natural* aspect ratio once it is known, and
 * is bounded rather than fixed — never taller than the height it was given,
 * never wider than its column. Until the dimensions arrive it falls back to the
 * old fixed box, so nothing jumps around while a large file loads.
 *
 * `object-fit: contain` stays as the backstop. It costs nothing once the ratio
 * is right, and it is what guarantees the picture is never cropped in the frame
 * between the metadata arriving and the layout settling.
 */
export function ClueMedia({
  media,
  mediaKey,
  label,
  height,
  autoPlay = false,
  controls = true,
  border = C.edgeSoft,
}: {
  media: Media;
  mediaKey: string;
  label?: string;
  /** The most height this may take. Portrait media uses all of it; wide media uses less. */
  height: string | number;
  autoPlay?: boolean;
  controls?: boolean;
  border?: string;
}) {
  // Stored against the key it was measured from. Replacing a clue's media keeps
  // this component mounted, so a bare number would size the new file to the old
  // one's shape until it happened to load.
  const [measured, setMeasured] = useState<{ key: string; ratio: number } | null>(null);
  const ratio =
    // An embed will not tell us its shape, and audio has none — a plate wants
    // the full box it was given rather than a ratio of its own.
    media === "youtube" ? 16 / 9 : media === "audio" ? null : (measured?.key === mediaKey ? measured.ratio : null);
  const measure = (w: number, h: number) => {
    if (w > 0 && h > 0) setMeasured({ key: mediaKey, ratio: w / h });
  };

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
        // Bounded, not fixed: `aspectRatio` decides the height, and `maxHeight`
        // stops a tall portrait image from pushing the clue text off screen.
        ...(ratio ? { aspectRatio: String(ratio), maxHeight: height, width: "auto", maxWidth: "100%" } : { height, width: "100%" }),
        minHeight: 0,
        // Centred rather than left-aligned, because once the frame is only as
        // wide as the picture needs, a wide column would otherwise leave it
        // hanging off one edge.
        margin: "0 auto",
        background: C.bg,
        border: `1px solid ${border}`,
        overflow: "hidden",
      }}
    >
      {media === "youtube" ? (
        // `origin` and `rel=0` keep the embed from advertising other channels'
        // videos at the end of a clue, which on a TV in front of a room is
        // exactly the wrong moment for a thumbnail of something else.
        <iframe
          key={mediaKey}
          src={`https://www.youtube-nocookie.com/embed/${mediaKey}?rel=0&modestbranding=1${autoPlay ? "&autoplay=1" : ""}`}
          title={label || "Clue video"}
          allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ ...fill, border: "none" }}
        />
      ) : media === "audio" ? (
        // Nothing to look at, so give the room something: the caption if there
        // is one, and controls big enough to be worked from arm's length.
        <div
          style={{
            ...fill,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            padding: 20,
          }}
        >
          <div style={{ fontSize: "clamp(28px,5vw,64px)", lineHeight: 1 }} aria-hidden>
            ♪
          </div>
          {label && (
            <div style={{ fontSize: "clamp(12px,1.4vw,20px)", color: C.dim, textAlign: "center" }}>{label}</div>
          )}
          <audio key={mediaKey} src={mediaUrl(mediaKey)} autoPlay={autoPlay} controls={controls} style={{ width: "90%" }} />
        </div>
      ) : media === "video" ? (
        <video
          key={mediaKey}
          src={mediaUrl(mediaKey)}
          autoPlay={autoPlay}
          controls={controls}
          playsInline
          onLoadedMetadata={(e) => measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          style={fill}
        />
      ) : (
        <img
          key={mediaKey}
          src={mediaUrl(mediaKey)}
          alt={label || ""}
          onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          style={fill}
        />
      )}
    </div>
  );
}

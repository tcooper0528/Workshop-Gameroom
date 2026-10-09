import React from "react";

/**
 * CardBack — the shared Workshop Gameroom card back.
 *
 * Shows the Workshop card art. When a game needs to indicate a color
 * (e.g. One Switcheroo's active / chosen color), pass the `color` prop and a colored
 * circle is drawn on top of the art.
 *
 * Two sizing modes:
 *   • Fixed (default): sized by `width`, keeps the true card proportions.
 *       <CardBack width={64} />           (Switcheroo draw pile / color indicator)
 *   • Fill: stretches to fill its parent container. Use this inside a grid
 *     cell that already sets the size/shape (e.g. Matching, Bingo).
 *       <CardBack fill rounded={12} />
 *
 * Props:
 *   color     "red" | "yellow" | "green" | "blue" | any CSS color string.
 *             Omit for a plain card back. Default: null.
 *   width     number (px) or CSS string. Ignored when `fill` is true. Default: 120.
 *   fill      boolean. When true, fills the parent (100% x 100%). Default: false.
 *   src       image path. Default: "/cardback.webp".
 *   rounded   corner radius in px. Default: 10.
 *   alt       image alt text. Default: "Card back".
 *   onClick   optional click handler (e.g. tap to play / draw).
 *   className, style  passed through / merged.
 */

// Standard four-color palette. Any name here maps to a nice preset shade;
// anything else falls through as a raw CSS color.
const COLOR_MAP = {
  red: "#e5484d",
  yellow: "#f5c518",
  green: "#2fb457",
  blue: "#2a7de1",
};

export default function CardBack({
  color = null,
  width = 120,
  fill = false,
  src = "/cardback.webp",
  rounded = 10,
  alt = "Card back",
  onClick,
  className = "",
  style = {},
  ...rest
}) {
  const resolved = color ? COLOR_MAP[String(color).toLowerCase()] || color : null;

  // Fixed mode uses width + the art's true ratio. Fill mode fills the parent,
  // which is expected to set its own size/shape (e.g. a 3:4 grid cell).
  const sizing = fill
    ? { width: "100%", height: "100%" }
    : {
        width: typeof width === "number" ? `${width}px` : width,
        aspectRatio: "640 / 954",
      };

  return (
    <div
      className={`card-back ${className}`.trim()}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        position: "relative",
        ...sizing,
        borderRadius: rounded,
        overflow: "hidden",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.25)",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        flexShrink: 0,
        ...style,
      }}
      {...rest}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {resolved && (
        // White ring (outer) + colored disc (inner). Both sized in %, so the
        // overlay scales perfectly at any card size.
        <div
          aria-label={typeof color === "string" ? `${color} color` : "color"}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "46%",
            aspectRatio: "1 / 1",
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div
            style={{
              width: "84%",
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              background: resolved,
              boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.25)",
            }}
          />
        </div>
      )}
    </div>
  );
}
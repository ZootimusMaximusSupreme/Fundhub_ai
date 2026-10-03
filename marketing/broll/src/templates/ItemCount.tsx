import React from 'react';
import {BrandFrame, CARD_EDGE, COLORS, Layer, P3D, Stage3D, TRACK, cardShadow, countUp, enter, fadeUp, useTimeline} from '../brand';

// ItemCount: the simple HiddenDataPoints, for "Sometimes it's one item.
// Sometimes it's twelve." A thick white tile comes forward with the count on
// it. It holds on the first number, then counts up (easing out), and one small
// raised block rises out of its socket on the tile each time the number ticks.
// A short label lands under the tile. No orbit, no glossy dots, no ring (those
// stay with the 13 hidden data points), no money.

export type ItemCountProps = {
  /** The number it starts on (the line's "one"). */
  from: number;
  /** The number it lands on (the line's "twelve"), 1 to 24. One raised block per item. */
  to: number;
  /** The short line under the tile, from the script line. Empty hides it. */
  label: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const ITEM_COUNT_BASE = 84;
/** The count has landed, every block is up and the label is in. */
export const ITEM_COUNT_HERO = 78;

// "Items" is the line's "item"; "on your file" is the line before it in $297
// Ad 1 ("Everything on your file holding you back"). Ad 24 can pass
// "Items holding it back".
export const itemCountDefaults: ItemCountProps = {
  from: 1,
  to: 12,
  label: 'Items on your file',
};

/** The count holds on `from`, then runs between these frames (the brand countUp, easing out). */
const COUNT_START = 20;
const COUNT_END = 64;
/** Blocks already counted at the start rise here, with the tile. */
const FIRST_IN = 9;

const TILE_W = 600;
const TILE_PAD_X = 56;
const TILE_THICK = 34;
/** The tile's resting tilt, degrees, on top of the camera: enough that its thickness shows. */
const TILE_TILT = {rx: 9, ry: -5};
/** Plate colors from just behind the tile face to the back: the tile's side. */
const TILE_PLATES = ['#E6E7EB', '#E1E3E7', '#DCDEE3', '#D7D9DF', '#D2D5DB', '#CDD0D7'];
const GRID_GAP = 18;
/** The block grid never grows past this height, so 13 to 24 items still fit the frame. */
const GRID_MAX_H = 200;
const BLOCK_MAX = 64;
/** How far a block stands up off the tile when it is fully risen, as a share of its width. */
const RISE = 0.15;

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Columns for n blocks: one row up to 6, then rows of up to 6 or 7. */
const columnsFor = (n: number): number => (n <= 6 ? n : n <= 12 ? Math.ceil(n / 2) : n <= 21 ? Math.ceil(n / 3) : Math.ceil(n / 4));

/**
 * The frame the shown number first reaches each count above `start`, found by
 * stepping the same countUp the number uses, so every block rises exactly when
 * its number appears.
 */
const tickFrames = (start: number, end: number): number[] => {
  const out: number[] = [];
  let k = start + 1;
  for (let t = COUNT_START; t <= COUNT_END && k <= end; t += 0.25) {
    const shown = Math.round(countUp(t, COUNT_START, COUNT_END, start, end));
    while (k <= shown && k <= end) {
      out.push(t);
      k++;
    }
  }
  while (k <= end) {
    out.push(COUNT_END);
    k++;
  }
  return out;
};

/** One raised block in its socket. `p` 0 to 1 raises it out of the tile. */
const Block: React.FC<{size: number; p: number}> = ({size, p}) => {
  const r = size * 0.27;
  const h = size * RISE * p;
  return (
    <div style={{position: 'relative', width: size, height: size}}>
      {/* the empty socket, pressed into the tile */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: r,
          background: '#F3F4F6',
          boxShadow: 'inset 0 3px 5px rgba(10,10,10,.07), inset 0 -1px 0 rgba(255,255,255,.9)',
        }}
      />
      {/* the block: blue top, a darker blue side under it (its height), a soft blue shadow on the tile */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: r,
          background: 'linear-gradient(180deg, #78ADF6 0%, #4A8FF2 38%, #3D86F0 62%, #3479DF 100%)',
          boxShadow: [
            'inset 0 2px 0 rgba(255,255,255,.35)',
            `0 ${h.toFixed(2)}px 0 #2C67C2`,
            `0 ${(h + 8).toFixed(2)}px ${(10 + h).toFixed(2)}px rgba(44,103,194,${(0.3 * p).toFixed(3)})`,
          ].join(', '),
          opacity: p,
          transform: `translateY(${-h}px) scale(${0.62 + 0.38 * p})`,
        }}
      />
    </div>
  );
};

export const ItemCount: React.FC<ItemCountProps> = ({from, to, label, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(ITEM_COUNT_BASE, durationInFrames);
  const L = ITEM_COUNT_BASE;
  const end = clampInt(to, 1, 24);
  const start = clampInt(from, 0, end);
  const shown = Math.round(countUp(f, COUNT_START, COUNT_END, start, end));
  const ticks = tickFrames(start, end);

  const cols = columnsFor(end);
  const rows = Math.ceil(end / cols);
  const block = Math.min(
    BLOCK_MAX,
    Math.floor((TILE_W - TILE_PAD_X * 2 - (cols - 1) * GRID_GAP) / cols),
    Math.floor((GRID_MAX_H - (rows - 1) * GRID_GAP) / rows),
  );
  const gridW = cols * block + (cols - 1) * GRID_GAP;

  const tileIn = enter(f, fps, 0, 18);
  const q = 1 - tileIn;
  const numberIn = enter(f, fps, 4, 14);
  const labelText = label.trim();

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L} drift={0.8}>
        {/* the tile: comes forward out of the wall and settles with a slight turn */}
        <div
          style={{
            position: 'relative',
            width: TILE_W,
            ...P3D,
            transform: `translate3d(0, ${q * 40}px, ${36 - q * 420}px) rotateX(${TILE_TILT.rx + q * 16}deg) rotateY(${TILE_TILT.ry}deg)`,
          }}
        >
          {TILE_PLATES.map((color, i) => {
            const last = i === TILE_PLATES.length - 1;
            return (
              <div
                key={color}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 48,
                  background: color,
                  opacity: tileIn,
                  transform: `translateZ(${(-(i + 1) * TILE_THICK) / TILE_PLATES.length}px)`,
                  boxShadow: last ? cardShadow(1.3) : undefined,
                }}
              />
            );
          })}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: `30px ${TILE_PAD_X}px 58px`,
              borderRadius: 48,
              background: 'linear-gradient(170deg, #FFFFFF 0%, #FFFFFF 55%, #F7F7F9 100%)',
              ...CARD_EDGE,
              boxShadow: 'inset 0 3px 0 rgba(255,255,255,.95)',
              opacity: tileIn,
            }}
          >
            <div
              style={{
                opacity: numberIn,
                fontSize: 280,
                fontWeight: 800,
                letterSpacing: '-0.06em',
                lineHeight: 1,
                // The tight tracking trims the last digit's right side; this puts it back so the number centers.
                paddingRight: 280 * 0.06,
                color: COLORS.ink,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {shown}
            </div>
            <div style={{marginTop: 18, width: gridW, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: GRID_GAP}}>
              {Array.from({length: end}, (_, i) => {
                const at = i < start ? FIRST_IN + i * 2 : ticks[i - start];
                return <Block key={i} size={block} p={enter(f, fps, at, 10)} />;
              })}
            </div>
          </div>
        </div>
        {labelText ? (
          <Layer z={44} style={{marginTop: 64}}>
            <div
              style={{
                ...fadeUp(enter(f, fps, 46, 14), 18),
                maxWidth: 860,
                textAlign: 'center',
                textWrap: 'balance',
                fontSize: 58,
                fontWeight: 700,
                letterSpacing: TRACK.h2,
                lineHeight: 1.1,
                color: COLORS.ink,
              }}
            >
              {labelText}
            </div>
          </Layer>
        ) : null}
      </Stage3D>
    </BrandFrame>
  );
};

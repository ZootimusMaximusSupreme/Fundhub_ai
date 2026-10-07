// src/yesdoor/stages.mjs — the application stage arrows (spec §3), in code.
// Pure. The database is the real guard (yd_stage_move_ok, migrations 435 and
// 437); this copy lets a handler refuse a bad move with a clear message BEFORE it
// opens a transaction. src/http/yesdoor-placements.pg.test.mjs fails if this list
// and the database function ever disagree.

export const ARROWS = Object.freeze([
  ["booked", "registered"],
  ["booked", "cancelled"],
  ["registered", "toured"],
  ["registered", "no_show"],
  // 437: a renter who withdraws before applying frees their place in the cap of 3.
  ["registered", "cancelled"],
  ["toured", "applied"],
  ["toured", "cancelled"],
  ["applied", "approved"],
  ["applied", "denied"],
  ["approved", "lease_signed"],
  ["lease_signed", "moved_in"],
  ["moved_in", "invoiced"],
  ["invoiced", "paid"],
  ["paid", "safe"],
  ["paid", "refunded"]
]);

const ARROW_SET = new Set(ARROWS.map(([a, b]) => `${a}>${b}`));

export const stageMoveOk = (from, to) => ARROW_SET.has(`${from}>${to}`);

/** Stages that count toward a renter's cap of open applications (the database
 *  partial index and trigger use the same list). */
export const OPEN_STAGES = Object.freeze(["booked", "registered", "toured", "applied", "approved", "lease_signed"]);

/** Stages a building may set from its portal. The rest belong to the system
 *  (booked, registered, invoiced, safe, cancelled) or to staff (paid). `refunded`
 *  is the building reporting that the renter left inside the refund window. */
export const BUILDING_STAGES = Object.freeze([
  "toured", "no_show", "applied", "approved", "denied", "lease_signed", "moved_in", "refunded"
]);

/** The column that holds the moment of a stage. */
export const stageColumn = (stage) => `${stage}_at`;

/** What a person is told when a move is not allowed. */
export function badMoveMessage(from, to) {
  const say = (s) => String(s).replace(/_/g, " ");
  return `A renter cannot move from "${say(from)}" to "${say(to)}".`;
}

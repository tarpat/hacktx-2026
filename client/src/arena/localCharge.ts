import type { ChargeKind } from "../gesture/gestureStateMachine";

/** The local player's gesture charge, so the arena can draw its casting circle. Times are performance.now(). */
export interface LocalCharge {
  kind: ChargeKind;
  startedAt: number;
  /** Set once the charge is released or cancelled. */
  ended: { at: number; result: "cast" | "fizzle" } | null;
}

let current: LocalCharge | null = null;

export function startLocalCharge(kind: ChargeKind, startedAt: number) {
  current = { kind, startedAt, ended: null };
}

export function endLocalCharge(result: "cast" | "fizzle") {
  if (current && !current.ended) current.ended = { at: performance.now(), result };
}

export function clearLocalCharge() {
  current = null;
}

export function localCharge(): LocalCharge | null {
  return current;
}

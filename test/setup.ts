import type { Computation } from "../deps.ts";

import { sleep } from "../mod.ts";

export function* createNumber(num: number) {
  yield* sleep(1);
  return num;
}

export function* blowUp<T>(): Computation<T> {
  yield* sleep(1);
  throw new Error("boom");
}

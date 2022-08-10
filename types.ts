import type { Future } from "./future.ts";
import type { Computation } from "./deps.ts";

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

export type Operation<T> = Computation<T>;

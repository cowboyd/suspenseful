import type { Future } from "./future.ts";

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

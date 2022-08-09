import type { Computation } from "./deps.ts";
import type { Task } from "./types.ts";
import { evaluate } from "./deps.ts";
import { createFuture, Future } from "./future.ts";
import { createContext, destroy, perform, reduce, suspend } from "./context.ts";
import { thunk } from "./thunk.ts";

export * from "./types.ts";
export * from "./future.ts";

export { perform, suspend } from "./context.ts";

export function run<T>(block: () => Computation<T>, name?: string): Task<T> {
  let context = createContext(name);
  let { future, resolve, reject } = createFuture<T>();

  evaluate(function* () {
    let result = yield* reduce(block, context);
    if (result.type === "resolved") {
      resolve(result.value);
    } else if (result.type === "rejected") {
      reject(result.error);
    } else {
      reject(new Error("halted"));
    }
  });
  let task: Task<T> = Object.create(future, {
    halt: {
      enumerable: false,
      value: thunk(function halt() {
        reject(new Error("halted"));
        return Future.eval(() => destroy(context));
      }),
    },
  });
  return task;
}

export function sleep(duration: number) {
  return perform(function* (resume) {
    let timeout = setTimeout(resume, duration);
    try {
      yield* suspend();
    } finally {
      clearTimeout(timeout);
    }
  }, "sleep");
}

export function expect<T>(promise: Promise<T>): Computation<T> {
  return perform(function* (resolve, reject) {
    let handler = { resolve, reject };
    promise.then(handler.resolve, handler.reject);
    try {
      yield* suspend();
    } finally {
      handler.resolve = handler.reject = () => {};
    }
  }, "expect");
}

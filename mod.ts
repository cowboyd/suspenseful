import type { Computation, Continuation } from "./deps.ts";
import type { Task } from "./types.ts";
import { evaluate, shift } from "./deps.ts";
import { createFuture, Future } from "./future.ts";
import {
  Context,
  createContext,
  destroy,
  perform,
  reduce,
  suspend,
} from "./context.ts";
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
  return shift<T>(function* (resolve, reject) {
    return function* (context: Context) {
      return yield* shift<T>(function* ($$resolve, $$reject) {
        promise
          .then((value) => {
            if (context.status === "active") {
              evaluate(function* () {
                try {
                  $$resolve(yield* resolve(value)(context));
                } catch (error) {
                  $$reject(error);
                }
              });
            }
          })
          .catch((error) => {
            if (context.status === "active") {
              evaluate(function* () {
                try {
                  $$resolve(yield* reject(error)(context));
                } catch (error) {
                  $$reject(error);
                }
              });
            }
          });
      });
    };
  });
}

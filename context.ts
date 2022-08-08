import type { Computation, Continuation } from "./deps.ts";
import { evaluate, reset, shift } from "./deps.ts";

export interface Context {
  status: "new" | "active" | "destroying" | "destroyed";
  id: number;
  name: string;
  yieldingTo?: Context;
  escape?: () => Computation<void>;
}

export function perform<T>(
  body: (resume: Continuation<T, void>) => Computation<T>,
  name?: string,
): Computation<T> {
  return shift<T>(function* ($resolve, $reject) {
    return function* (context: Context) {
      let child = createContext(name);
      context.yieldingTo = child;

      return yield* shift<T>(function* ($$resolve, $$reject) {
        let call = {
          resolve: (value: T) =>
            evaluate(function* () {
              try {
                delete context.yieldingTo;
                yield* destroy(child);
                $$resolve(yield* $resolve(value)(context));
              } catch (error) {
                $$reject(error);
              }
            }),
          reject: (error: Error) =>
            evaluate(function* () {
              try {
                delete context.yieldingTo;
                yield* destroy(child);
                $$reject(yield* $reject(error)(context));
              } catch (error) {
                $$reject(error)(context);
              }
            }),
        };
        yield* reduce(() => body(call.resolve), child);
      });
    };
  });
}

export function suspend() {
  return shift(function* (_1, _2, escape) {
    return function* (context: Context) {
      context.escape = function* () {
        let next = escape({ type: "dropped " });
        if (next) {
          yield* next(context);
        }
      };
    };
  });
}

export type Reduction<T> = {
  type: "resolved";
  value: T;
} | {
  type: "rejected";
  error: Error;
} | {
  type: "dropped";
};

export function* reduce<T>(
  block: () => Computation<T>,
  context: Context,
): Computation<Reduction<T>> {
  let start = yield* reset<(context: Context) => Computation>(function* () {
    try {
      let value = yield* block();

      return function* () {
        return { type: "resolved", value };
      };
    } catch (error) {
      return function* () {
        return { type: "rejected", error };
      };
    }
  });

  try {
    context.status = "active";
    return yield* start(context);
  } finally {
    context.status = "destroyed";
  }
}

export function* destroy(context: Context): Computation<void> {
  // try {
  //   context.status = "destroying";
  //   let yieldingTo = context.yieldingTo;
  //   if (yieldingTo) {
  //     delete context.yieldingTo;
  //     yield* destroy(yieldingTo);
  //   }
  //   if (context.escape) {
  //     yield* context.escape();
  //   }
  // } finally {
  //   context.status = "destroyed";
  // }
}

let ids = 1;
export function createContext(name = "anonymous"): Context {
  return {
    id: ids++,
    status: "new",
    name,
  };
}

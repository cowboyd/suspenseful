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
  body: (
    resolve: Continuation<T, void>,
    reject: Continuation<Error, void>,
  ) => Computation<void>,
): Computation<T> {
  return shift<T>(function* ($resolve, $reject, $escape) {
    return function* (context: Context) {
      context.escape = createEscape(context, $escape);
      return yield* shift<T>(function* ($$resolve, $$reject) {
        let child = createContext();
        context.yieldingTo = child;

        let outcome = {
          resolve: (value: T) =>
            evaluate(function* () {
              if (child.status === "active") {
                outcome.resolve = () => {};
                try {
                  delete context.yieldingTo;
                  yield* destroy(child);
                  $$resolve(yield* $resolve(value)(context));
                } catch (error) {
                  $$reject(error);
                }
              }
            }),
          reject: (error: Error) =>
            evaluate(function* () {
              if (child.status === "active") {
                outcome.reject = () => {};
                try {
                  delete context.yieldingTo;
                  yield* destroy(child);
                  $$resolve(yield* $reject(error)(context));
                } catch (error) {
                  $$reject(error);
                }
              }
            }),
        };
        let operations = body(outcome.resolve, outcome.reject);
        child.name = (() => {
          if ("name" in operations) {
            return (operations as unknown as { name: string }).name;
          } else {
            return body.name ?? "anonymous";
          }
        })();
        yield* reduce(operations, child);
      });
    };
  });
}

export function effect<T>(body: (provide: Continuation<T,Computation<void>>) => Computation<void>): Computation<T> {
  return shift<T>(function*($resolve, _$, $escape) {
    return function* (context: Context) {
      context.escape = createEscape(context, $escape);
      let result: unknown;

      function provide(value: T) {
        return shift<void>(function*(resolve,reject, escape) {
          return function*(resource: Context) {
            context.escape = createEscape(resource, escape);
            try {
              result = yield* $resolve(value)(context);
              yield* resolve()(resource);
            } catch (error) {
              yield* reject(error)(resource);
            }
          }
        });
      }

      let resource = createContext('resource');
      try {
        yield* reduce(body(provide), resource);
        return result;
      } finally {
        yield* destroy(resource);
      }
    }
  })
}

export function suspend() {
  return shift<void>(function* (_$, _$$, escape) {
    return (context: Context) => {
      context.escape = createEscape(context, escape);
      return shift<void>(function* () {});
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
  operations: Computation<T>,
  context: Context,
): Computation<Reduction<T>> {
  return yield* shift<Reduction<T>>(function* (resolve, reject) {
    let start = yield* reset<(context: Context) => Computation>(function* () {
      try {
        let value = yield* operations;

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
      resolve(yield* start(context));
    } catch (error) {
      reject(error);
    } finally {
      context.status = "destroyed";
    }
  });
}

export function* destroy(context: Context): Computation<void> {
  try {
    context.status = "destroying";
    let yieldingTo = context.yieldingTo;
    if (yieldingTo) {
      delete context.yieldingTo;
      yield* destroy(yieldingTo);
    }
    if (context.escape) {
      yield* context.escape();
    }
  } finally {
    context.status = "destroyed";
  }
}

let ids = 1;
export function createContext(name = "anonymous"): Context {
  return {
    id: ids++,
    status: "new",
    name,
  };
}

function createEscape(
  context: Context,
  $escape: Continuation,
): () => Computation<void> {
  return function* escape() {
    yield* $escape(function* () {
      return { type: "dropped" };
    })(context);
  };
}

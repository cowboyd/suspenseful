import type { Computation, Continuation } from "./deps.ts";
import type { Task } from "./types.ts";
import { reset, shift, evaluate } from "./deps.ts";
import { createFuture } from "./future.ts";

// not any context can be suspended.
export function run<T>(block: () => Computation<T>): Task<T> {
  let context = createContext();
  let { future, resolve, reject } = createFuture<T>();

  evaluate(function*() {
    try {
      resolve(yield* reduce(block, context));
    } catch (error) {
      reject(error);
    }
  })
  return Object.create(future, {
    halt: {
      value: function halt() {
        reject(new Error('halted'));
        evaluate(context.unsuspend);
      }
    }
  }) as Task<T>;
}

export function suspend() {
  return shift(function*(_res, _rej, escape) {
    return (context: Context) => context.suspend(escape)
  });
}

export function sleep(duration: number) {
  return shift<void>(function*(k) {
    return function*(context: Context) {
      setTimeout(() => evaluate(() => k()(context)), duration);
    }
  })
}

export function expect<T>(promise: Promise<T>): Computation<T> {
  return shift<T>(function*(resolve, reject) {
    return function* expect(context: unknown) {
      promise
        .then(value => {
          evaluate(() => resolve(value)(context));
        })
        .catch(error => {
          evaluate(() => reject(error)(context));
        });
    }
  });
}

export function* reduce<T, TContext>(block: () => Computation<T>, context: TContext): Computation<T> {
  return yield* shift(function*(resolve, reject) {
    let start = yield* reset<(context: TContext) => Computation<T>>(function*() {
      try {
        let result = yield* block();
        return function* () {
          resolve(result);
        }
      } catch (error) {
        return function* () {
          reject(error);
        }
      }
    });
    yield* start(context);
  })
}

interface Context {
  id: number;
  suspend(k: Continuation<void>): Computation<void>;
  unsuspend(): Computation<void>;
}

let ids = 1;
function createContext(): Context {
  let escape: Continuation<void>;
  let context: Context = {
    id: ids++,
    *suspend(k) {
      escape = k;
      context.suspend = function*() {
        throw new Error('operation cannot be suspended twice');
      }
    },
    *unsuspend() {
      if (!escape) {
        context.suspend = function* suspend(k) {
          let next = k();
          if (typeof next === 'function') {
            yield* next(context);
          }
        }
      }
    }
  };
  return context;
}

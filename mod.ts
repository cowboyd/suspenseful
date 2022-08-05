import type { Computation, Continuation } from "./deps.ts";
import type { Task } from "./types.ts";
import { assert, reset, shift, evaluate } from "./deps.ts";
import { createFuture } from "./future.ts";

export * from "./types.ts";
export * from "./future.ts";

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
        evaluate(context.destroy);
      }
    }
  }) as Task<T>;
}

export function perform<T>(body: (resume: Continuation<T,void>) => Computation<T>): Computation<T> {
  return shift<T>(function*(resume) {
    return function*(context: Context) {
      let child = createContext();
      let resumeCaller = (value: T) => evaluate(function*() {
        yield* child.destroy();
        yield* context.reenter();
        yield* resume(value)(context);
      });

      yield* context.yieldTo(child);
      yield* reduce(() => body(resumeCaller), child);
    }
  });
}

export function suspend() {
  return shift(function*(_res, _rej, escape) {
    return (context: Context) => context.suspend(escape)
  });
}

export function sleep(duration: number) {
  return perform(function*(resume) {
    let timeout = setTimeout(resume, duration);
    try {
      yield* suspend()
    } finally {
      clearTimeout(timeout);
    }
  });
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
  suspend(k: Continuation): Computation<void>;
  destroy(): Computation<void>;
  yieldTo(child: Context): Computation<void>;
  reenter(): Computation<void>;
}

let ids = 1;
function createContext(): Context {
  let escape: Continuation;
  let yieldingTo: Context | undefined;

  let context: Context = {
    id: ids++,
    *yieldTo(child: Context) {
      assert(!yieldingTo, "cannot yield to two children at the same time");
      yieldingTo = child;
    },
    *reenter() {
      assert(!!yieldingTo, "cannot resume a context that is not currently yielding");
      yieldingTo = void 0;
    },
    *suspend(k) {
      escape = k;
      context.suspend = function*() {
        throw new Error('operation cannot be suspended twice');
      }
    },
    *destroy() {
      if (yieldingTo) {
        yield* yieldingTo.destroy();
      }
      if (!escape) {
        context.suspend = function* suspend(k) {
          yield* k(function*() {})(context);
        }
      } else {
        yield* escape(function*() {})(context);

      }
    }
  };
  return context;
}

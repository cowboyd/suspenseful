import type { Computation } from "./deps.ts";
import type { Task } from "./types.ts";
import { reset, shift, evaluate } from "./deps.ts";
import { Future } from "./future.ts";

export function run<T>(block: () => Computation<T>): Task<T> {
  return Future.eval(() => reduce(block, createContext()));
}

export function* suspend() {
  return yield* shift<void>(function*() {
    return function*() {}
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

export function sleep(duration: number) {
  return shift<void>(function*(resolve) {
    return function*(context: unknown) {
      let timeout: number;
      function resume() {
        clearTimeout(timeout);
        evaluate(() => resolve()(context));
      }
      timeout = setTimeout(resume, duration);
    }
  })
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

function createContext() {
  return { *unsuspend() {} }
}

import { evaluate, shift, reset, Computation } from "./deps.ts";
import { Future } from './future.ts';

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

export function run<T>(block: () => Computation<T>): Future<T> {
  return Future.eval(function*() {
    let initial: Context = {
      *unsuspend() {}
    };
    return yield* reduce(block, initial);
  });
}

function* fn<T>(block: (resume: (result: T) => void) => Computation<T>): Computation<T> {
  return yield* shift<T>(function*(k) {
    return function*(parent: Context) {
      let child: Context = {
        *unsuspend() {}
      };
      let resume = (value: T) => evaluate(function*() {
        yield* child.unsuspend();
        yield* k(value)(parent)
      });

      return yield* reduce(() => block(resume), child);
    }

  });
}


//TODO: how to unwind context through multiple effects? Can it control the return value?
//TODO: context.expect() / context.join();
export function* effect<T>(body: (provide: (value: T) => Computation<void>) => Computation<void>): Computation<T> {

  return yield* shift<T>(function*(resume) {
    return function*(parent: Context) {

      function* provide(value: T): Computation<void> {
        yield* shift<void>(function*(resolve, reject) {
          return function*(context: Context) {
            console.log('resume child');
            try {
              yield* resume(value)(parent);
            //yield* parent.expect();
              yield* resolve()(context);
              console.log('resume child done');
            } catch (error) {
              yield* reject(error)(context);
            }
            console.log('finish provide');
          };
        });
      }
      yield* reduce(() => body(provide), { *unsuspend() {} });
    };
  });
}

interface Context {
  unsuspend(): Computation<void>;
}

function* reduce<T, TContext>(block: () => Computation<T>, context: TContext): Computation<T> {
  let start = yield* reset<(context: TContext) => Computation<T>>(function*() {
    let result = yield* block();
    return function*() {
      return result;
    }
  });
  return yield* start(context);
}

export function* suspend() {
  yield* shift<void>(function*(k) {
    return function*(context: Context) {
      context.unsuspend = () => k()(context);
    }
  });
}

export function sleep(duration: number): Computation<void> {
  return fn(function* (resume) {
    yield* effect(function*(provide) {
      let interval = setInterval(() => console.log('snore', 200));
      try {
        return yield* provide();
      } finally {
        clearInterval(interval);
      }
    });

    let timeout = setTimeout(resume, duration);
    try {
      yield* suspend();
    } finally {
      console.log('timeout cleared');
      clearTimeout(timeout);
    }
  })
}

await run(function*() {
  console.log('yawn');
  yield* sleep(2500);
  console.log('what?');
  yield* sleep(2500);
  console.log('done');
})

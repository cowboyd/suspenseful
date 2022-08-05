import { evaluate, shift, reset, Computation } from "./deps.ts";
import { Future } from './future.ts';

export interface Task<T> extends Future<T> {
  halt(): Future<void>;
}

export function run<T>(block: () => Computation<T>): Future<T> {
  return Future.eval(function*() {
    //TODO: context.expect();
    return yield* reduce(block, createContext());
  });
}

function* fn<T>(block: (resume: (result: T) => void) => Computation<T>): Computation<T> {
  return yield* shift<T>(function*(k) {
    return function*(parent: Context) {

      let child = createContext();

      let resume = (value: T) => evaluate(function*() {
        yield* child.unsuspend();
        // TC yield* child.expect();
        yield* k(value)(parent)
      });

      return yield* reduce(() => block(resume), child);
    }
  });
}

// TODO: How does error propagate? Through spawn, or through run?
export function spawn<T>(block: () => Computation<T>): Computation<Future<T>> {
  return effect<Future<T>>(function*(provide) {
    let task = run(block);
    try {
      yield* provide(task);
    } finally {
      //yield* task.halt();
      console.log('halt()');
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
            try {
              yield* resume(value)(parent);
            //yield* parent.join();
              yield* resolve()(context);
            } catch (error) {
              yield* reject(error)(context);
            }
          };
        });
      }
      yield* reduce(() => body(provide), createContext());
    };
  });
}

interface Context {
  unsuspend(): Computation<void>;
}

function createContext(): Context {
  return {
    *unsuspend() {}
  }
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
});

console.log('exit()');

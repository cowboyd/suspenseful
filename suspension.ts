import { evaluate, shift, reset, Computation } from "./deps.ts";

function* operation<T>(block: (resume: (result: T) => void) => Computation<T>): Computation<T> {
  return yield* shift<T>(function*($return) {
    let context: Context = {
      *unsuspend() {},
    };

    let resume = (value: T) => evaluate(function*() {
      yield* context.unsuspend();
      // yield* $return(value)(parent)

      $return(value);
    });

    return yield* reduce(() => block(resume), context);
  });
}

export function* effect<T>(body: (provide: (value: T) => Computation<void>) => Computation<void>): Computation<T> {

  return yield* shift<T>(function*(k) {

    return function*(context: Context) {
      function* provide(value: T): Computation<void> {
        yield* k(value)(context);
      }
      console.log('start reducing the body');
      yield* reduce(() => body(provide), context);
      console.log('done reducing the body')
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
  return operation(function* (resume) {
    yield* effect(function*(provide) {
      let interval = setInterval(() => console.log('snore', 200));
      try {
        yield* provide();
      } finally {
        clearInterval(interval);
      }
    });

    let timeout = setTimeout(resume, duration);
    try {
      console.log('will suspend');
      yield* suspend();
      console.log('did suspend');
    } finally {
      console.log('timeout cleared');
      clearTimeout(timeout);
    }
  })
}

evaluate(function*() {
  console.log('yawn');
  yield* sleep(1500);
  console.log('what?');
  yield* sleep(1500);
  console.log('done');
})

import { Computation, evaluate, K, reset, shift } from "./deps.ts";

export interface Future<T> extends Promise<T>, Computation<T> {}

export type Resolve<T> = K<T, void>;
export type Reject = Resolve<Error>;

export interface NewFuture<T> {
  future: Future<T>;
  resolve: Resolve<T>;
  reject: Reject;
}

type Result<T> = {
  type: "resolved";
  value: T;
} | {
  type: "rejected";
  error: Error;
};

export function createFuture<T>(): NewFuture<T> {
  let result: Result<T>;
  let watchers: { resolve: K<T>; reject: K<Error> }[] = [];
  let notifying = false;

  function* notify() {
    if (notifying) {
      return;
    }
    notifying = true;
    try {
      for (
        let watcher = watchers.shift();
        watcher;
        watcher = watchers.shift()
      ) {
        if (result.type === "resolved") {
          watcher.resolve(result.value);
        } else {
          watcher.reject(result.error);
        }
      }
    } finally {
      notifying = false;
    }
  }

  return evaluate<NewFuture<T>>(function* () {
    let future: Future<T> = Object.create(Future.prototype, {
      [Symbol.toStringTag]: { value: "Future" },
      [Symbol.iterator]: { value },
      //deno-lint-ignore no-explicit-any
      then: { value: (...args: any[]) => promise().then(...args) },
      //deno-lint-ignore no-explicit-any
      catch: { value: (...args: any[]) => promise().catch(...args) },
      //deno-lint-ignore no-explicit-any
      finally: { value: (...args: any[]) => promise().finally(...args) },
    });

    // This just makes it so when you console.log a Future it is
    // maximally helpful. It is not part of the public API
    // console.log(Future.suspend());
    // => Future { status: "pending" }
    //
    // console.log(Future.resolve(10));
    // => Future { resolved: 10 }
    //
    // console.log(Future.reject(new Error("boom!")));
    // => Future { rejected: Error { message: "boom!" } }
    let report = future as unknown as Record<string, unknown>;
    report.status = "pending";

    let settle = yield* reset<K<Result<T>>>(function* () {
      result = yield* shift<Result<T>>(function* (k) {
        return k;
      });
      delete report.status;
      if (result.type === "resolved") {
        report.resolved = result.value;
      } else {
        report.rejected = result.error;
      }
      yield* notify();
    });

    function* value() {
      return yield* shift<T>(function* (resolve, reject) {
        watchers.push({ resolve, reject });
        if (result) {
          yield* notify();
        }
      });
    }

    let promise = lazy(() =>
      new Promise<T>((resolve, reject) => {
        evaluate(function* () {
          try {
            resolve(yield* value());
          } catch (error) {
            reject(error);
          }
        });
      })
    );

    return {
      future,
      resolve: (value: T) => settle({ type: "resolved", value }),
      reject: (error: Error) => settle({ type: "rejected", error }),
    };
  });
}

export class Future<T> {
  static resolve(value: void): Future<void>;
  static resolve<T>(value: T): Future<T>;
  static resolve<T>(value?: T): Future<T | undefined> {
    return new Future((resolve) => resolve(value as T));
  }

  static reject<T = unknown>(error: Error): Future<T> {
    return new Future<T>((_, reject) => reject(error));
  }

  static suspend(): Future<never> {
    return new Future(() => {});
  }

  static eval<T>(compute: () => Computation<T>): Future<T> {
    return new Future((resolve, reject) => {
      evaluate(function* () {
        try {
          resolve(yield* compute());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  constructor(fn: (resolve: Resolve<T>, reject: Reject) => void) {
    let { future, resolve, reject } = createFuture<T>();
    fn(resolve, reject);
    return future;
  }
}

function lazy<T>(create: () => T): () => T {
  let thunk = () => {
    let value = create();
    thunk = () => value;
    return value;
  };
  return () => thunk();
}

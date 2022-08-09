import { describe, expect, it } from "./suite.ts";
import { blowUp, createNumber } from "./setup.ts";

import {
  createFuture,
  expect as $expect,
  perform,
  run,
  sleep,
  suspend,
} from "../mod.ts";

describe("generator function", () => {
  it("can compose multiple promises via generator", async () => {
    let result = await run(function* () {
      let one = yield* $resolve(12);
      let two = yield* $resolve(55);
      return one + two;
    });
    expect(result).toEqual(67);
  });

  it("can compose operations", async () => {
    await expect(run(function* () {
      let one: number = yield* createNumber(12);
      let two: number = yield* createNumber(55);
      return one + two;
    })).resolves.toEqual(67);
  });

  it("rejects generator if subtask promise fails", async () => {
    await expect(run(function* () {
      let one = yield* createNumber(12);
      let two = yield* blowUp<number>();
      return one + two;
    })).rejects.toEqual(new Error("boom"));
  });

  it("rejects generator if generator creation fails", async () => {
    await expect(run(function* () {
      throw new Error("boom");
    })).rejects.toEqual(new Error("boom"));
  });

  it("rejects generator if subtask operation fails", async () => {
    await expect(run(function* () {
      let one = yield* createNumber(12);
      let two = yield* blowUp<number>();
      return one + two;
    })).rejects.toEqual(new Error("boom"));
  });

  it("can recover from errors in promise", async () => {
    await expect(run(function* () {
      let one = yield* $resolve(12);
      let two: number;
      try {
        yield* $reject(new Error("boom"));
        two = 9;
      } catch (_e) {
        // swallow error and yield in catch block
        two = yield* $resolve(8);
      }
      let three = yield* $resolve(55);
      return one + two + three;
    })).resolves.toEqual(75);
  });

  it("can recover from errors in operation", async () => {
    await expect(run(function* () {
      let one: number = yield* $resolve(12);
      let two: number;
      try {
        yield* blowUp();
        two = 9;
      } catch (_e) {
        // swallow error and yield in catch block
        two = yield* $resolve(8);
      }
      let three = yield* $resolve(55);
      return one + two + three;
    })).resolves.toEqual(75);
  });

  it("can halt generator", async () => {
    let task = run(function* () {
      let one = yield* $resolve(12);
      yield* suspend();
      return one;
    });

    await task.halt();

    await expect(task).rejects.toEqual(new Error("halted"));
  });

  it("halts child task when halted generator", async () => {
    let halted = false;
    let t = run(function* () {
      yield* perform(function* () {
        try {
          yield* suspend();
        } finally {
          halted = true;
        }
      });
    });

    await t.halt();

    await expect(t).rejects.toEqual(new Error("halted"));
    expect(halted).toEqual(true);
  });

  it("can suspend in finally block", async () => {
    let { future, resolve } = createFuture<number>();

    let task = run(function* () {
      try {
        yield* suspend();
      } finally {
        yield* sleep(10);
        resolve(123);
      }
    });

    await task.halt();

    await expect(task).rejects.toEqual(new Error("halted"));
    await expect(future).resolves.toEqual(123);
  });

  it("can suspend in yielded finally block", async () => {
    let things: string[] = [];

    let task = run(function* () {
      try {
        yield* perform(function* () {
          try {
            yield* suspend();
          } finally {
            yield* sleep(5);
            things.push("first");
          }
        }, "middle");
      } finally {
        things.push("second");
      }
    }, "main");

    await task.halt();

    await expect(task).rejects.toEqual(new Error("halted"));

    expect(things).toEqual(["first", "second"]);
  });

  // it('can await halt', async () => {
  //   let didRun = false;

  //   let task = run(function*() {
  //     try {
  //       yield;
  //     } finally {
  //       yield Promise.resolve(1);
  //       didRun = true;
  //     }
  //   });

  //   await task.halt();

  //   expect(didRun).toEqual(true);
  //   expect(task.state).toEqual('halted');
  // });

  // it('can be halted while in the generator', async () => {
  //   let { future, produce } = createFuture();
  //   let task = run(function*(inner) {
  //     inner.run(function*() {
  //       yield sleep(2);
  //       produce({ state: 'errored', error: new Error('boom') });
  //     });
  //     yield future;
  //   });

  //   await expect(task).rejects.toHaveProperty('message', 'boom');
  //   expect(task.state).toEqual('errored');
  // });

  // it('can halt itself', async () => {
  //   let task = run(function*(inner) {
  //     inner.halt();
  //   });

  //   await expect(task).rejects.toHaveProperty('message', 'halted');
  //   expect(task.state).toEqual('halted');
  // });

  // it('can halt itself between yield points', async () => {
  //   let task = run(function*(inner) {
  //     yield sleep(1);

  //     inner.run(function*() {
  //       inner.halt();
  //     });

  //     yield;
  //   });

  //   await expect(task).rejects.toHaveProperty('message', 'halted');
  //   expect(task.state).toEqual('halted');
  // });

  // it('can delay halt if child fails', async () => {
  //   let didRun = false;
  //   let task = run(function*(inner) {
  //     inner.run(function* willBoom() {
  //       yield sleep(5);
  //       throw new Error('boom');
  //     });
  //     try {
  //       yield;
  //     } finally {
  //       yield sleep(20);
  //       didRun = true;
  //     }
  //   });

  //   await run(sleep(10));

  //   expect(task.state).toEqual('erroring');

  //   await expect(task).rejects.toHaveProperty('message', 'boom');
  //   expect(didRun).toEqual(true);
  // });

  // it('can throw error when child blows up', async () => {
  //   let task = run(function*(inner) {
  //     inner.run(function* willBoom() {
  //       yield sleep(5);
  //       throw new Error('boom');
  //     });
  //     try {
  //       yield;
  //     } finally {
  //       throw new Error('bang');
  //     }
  //   });

  //   await expect(task).rejects.toHaveProperty('message', 'bang');
  // });

  // it('can throw error when yield point is not a valid operation', async () => {
  //   let task = run(function*() {
  //     yield "I am not an operation" as unknown as Operation<unknown>;
  //   });

  //   await expect(task).rejects.toHaveProperty('message', 'unkown type of operation: I am not an operation');
  // });
});

const $resolve = <T>(value: T) => $expect(Promise.resolve(value));
const $reject = (error: Error) => $expect(Promise.reject(error));

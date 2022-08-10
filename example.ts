import { Operation, run, effect, sleep } from "./mod.ts";

interface Num {
  value: number;
  incrementSlowly(): Operation<void>;
}

function useNum(initial: number) {
  return effect<Num>(function*(provide) {
    let value = initial;
    try {
      console.log(`creating a number starting at ${initial}`);
      let num = {
        get value() { return value },
        *incrementSlowly() {
          yield* sleep(1000);
          value++
        },
      }
      // We actually yield back to the caller here.
      // the caller is now contained within the callee!
      yield* provide(num);
    } finally {
      console.log(`destroying your number at ${value}`);
    }
  })
}


let answer = await run(function*() {
  let first = yield* useNum(0);

  yield* sleep(1000);

  let second = yield* useNum(5);

  yield* first.incrementSlowly();

  console.log(`first is now`, first.value);

  yield* first.incrementSlowly();

  console.log(`first is now`, first.value);

  yield* second.incrementSlowly();

  console.log(`second is now`, second.value);

  yield* sleep(1000);

  return first.value + second.value;
});

console.log(`the answer is: ${answer}`);

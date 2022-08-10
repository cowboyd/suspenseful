## Suspenseful Effection

Another spike of Effection using delimited continuations, although fully
embracing them, including `yield*`.

Key differences:

### no more `yield undefined`.

A key aspect of this spike is that you do not use
`yield`, only `yield*`. This means that you must have an iterable everywhere, so
`yield* suspend()` is how you get the previous behavior.

### Only three types of `Operation`

There are only `perform` `effect` and `suspend`. Every other operation is a
combination of these three primitives.

* **suspend** obvious. suspends.

* **perform**

``` javascript
export function sleep(duration: number) {
  return perform(function*(resolve) {
    let timeoutId = setTimeout(resolve, duration);
    try {
      yield* suspend();
    } finally {
      clearTimeout(timeoutId);
    }
  });
}
```

In a `perform`, the `resolve` is a full fledged continuation, that means that
when you call it, it actually resumes where it was suspended.

* **effect**

Wasn't sure whether to name this `effect` or `resource`, but whereas `perform`
starts a new computation and "pulls" the value from it. Effect, "pushes" a value
into the current computation. It does this with a `provide` operation which is
passed to it which means "continue the computation, but with this value".

``` javascript
export function useServer(port) {
  return effect(function*(provide) {
    let server = createServer();
    try {
      yield* provide(server); // <-- contains the rest of the caller!
    } finally {
      server.close();
    }
  });
}
```

use it like so:

``` javascript
function* run() {
  let server = yield* useServer(3000);

  yield* suspend();
}
```

Because effect's "contain" the rest of the computation, you can implement error
boundaries / loggers:

``` javascript
function* run() {
  yield* effect(function*(provide) {
    try {
      yield* provide();
    } catch (error) {
      console.error(error);
    }
  });

  throw new Error('boom!');
}
```

## Development

### run tests

```
$ deno test
```


### run example

``` javascript
$ deno run example.ts
```

export function thunk<T>(fn: () => T) {
  let result: { type: "error"; error: Error } | { type: "value"; value: T };

  let call: () => T = () => {
    call = () => {
      if (result.type === "error") throw result.error;
      return result.value;
    };
    try {
      result = { type: "value", value: fn() };
    } catch (error) {
      result = { type: "error", error };
    }
    return call();
  };

  return () => call();
}

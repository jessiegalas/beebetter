const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// Execute the real TS modules with deterministic service/native mocks. This is
// a small hook lifecycle harness, not a substitute for Android navigation tests.
function hooks() {
  const slots = [];
  let cursor = 0, pending = [], component, output, queued = false, alive = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  function render() {
    if (!alive) return;
    cursor = 0;
    output = component();
    const effects = pending; pending = [];
    effects.forEach(fn => fn());
    return output;
  }
  function schedule() {
    if (!alive || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; render(); });
  }
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      const set = value => {
        const next = typeof value === 'function' ? value(slots[i].value) : value;
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; schedule(); }
      };
      return [slots[i].value, set];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        pending.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  react.useLayoutEffect = react.useEffect;
  return {
    react,
    mount(fn) { component = fn; return render(); },
    render,
    get value() { return output?.type === 'provider' ? output.props.value : output; },
    unmount() { alive = false; slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const silentConsole = { ...console, warn() {}, error() {} };
function load(relative, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require: name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name} in ${relative}`); },
    React: mocks.react, URL, URLSearchParams, AbortController, console: silentConsole, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {}, ...globals,
  }, { filename: relative });
  return module.exports;
}

module.exports = { hooks, load };

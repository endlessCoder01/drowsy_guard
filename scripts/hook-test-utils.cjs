const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const ROOT = path.join(__dirname, '..');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Evaluate the real app modules, replacing only external dependencies that need
// a device. Each harness has its own module cache and storage write queue.
function moduleLoader(mocks) {
  const cache = new Map();
  function load(filename) {
    const resolved = path.extname(filename) ? filename : `${filename}.js`;
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = { exports: {} };
    cache.set(resolved, module);
    const source = babel.transformSync(fs.readFileSync(resolved, 'utf8'), {
      filename: resolved,
      babelrc: false,
      configFile: false,
      plugins: [require('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const localRequire = (name) => {
      if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
      if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
      throw new Error(`Missing test dependency: ${name} in ${resolved}`);
    };
    const evaluate = vm.runInNewContext(`(function(require, module, exports) {\n${source}\n})`, {
      console: { warn() {}, error() {} },
      setTimeout,
      clearTimeout,
    }, { filename: resolved });
    evaluate(localRequire, module, module.exports);
    return module.exports;
  }
  return (relative) => load(path.join(ROOT, relative));
}

// Simulate committed React hook renders and effect cleanup. Replaying functional
// updaters catches accidental storage/native side effects inside state setters.
function hookRuntime() {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let effects = [];
  let renderHook;
  let current;
  let updaterReplays = 0;
  const equalDeps = (left, right) => left && right && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = (update) => {
          if (!mounted) return;
          if (typeof update === 'function') {
            update(slot.value);
            updaterReplays += 1;
          }
          const next = typeof update === 'function' ? update(slot.value) : update;
          if (!Object.is(next, slot.value)) { slot.value = next; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !equalDeps(slots[index].deps, deps)) {
        const oldCleanup = slots[index]?.cleanup;
        slots[index] = { deps };
        effects.push(() => { oldCleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  function render() {
    assert.ok(mounted, 'cannot render an unmounted hook');
    dirty = false;
    cursor = 0;
    effects = [];
    current = renderHook();
    effects.forEach((effect) => effect());
  }
  return {
    hooks,
    get state() { return current; },
    get updaterReplays() { return updaterReplays; },
    mount(callback) { renderHook = callback; render(); },
    flush() { if (dirty) render(); return current; },
    unmount() {
      mounted = false;
      for (const slot of slots) slot?.cleanup?.();
    },
    async settle() {
      for (let turn = 0; turn < 8; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        if (mounted && dirty) render();
      }
      assert.ok(!mounted || !dirty, 'hook state should settle');
      return current;
    },
  };
}

module.exports = { ROOT, deferred, moduleLoader, hookRuntime };

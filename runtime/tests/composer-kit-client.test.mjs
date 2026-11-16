// The composer kit's browser half is a static client bundle: it registers one entry in
// `conversation.input.left` and hands picked files to the shipped draft pipeline.
//   node --test runtime/tests/composer-kit-client.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../bridge/dsh-composer-kit/lib/client.js", import.meta.url), "utf8");

// A hook runtime just good enough to render one function component repeatedly: hook slots
// keep their value across renders, the cursor resets, effects are collected per render.
function hooks() {
  let state = [];
  let cursor = 0;
  let effects = [];

  const slot = (initial) => {
    const at = cursor++;
    if (!(at in state)) state[at] = initial;
    return at;
  };

  const api = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    Fragment: Symbol("Fragment"),
    useState: (initial) => {
      const at = slot(typeof initial === "function" ? initial() : initial);
      return [state[at], (next) => {
        state[at] = typeof next === "function" ? next(state[at]) : next;
      }];
    },
    useRef: (initial) => {
      const at = slot({ current: initial });
      return state[at];
    },
    useMemo: (fn) => state[slot(fn())],
    useCallback: (fn) => fn,
    useEffect: (fn) => {
      effects.push(fn);
    },
  };

  // React attaches refs during the commit, not during render. The components under test
  // read refs in event handlers, so assigning them right after a render is faithful enough.
  const clicks = [];
  function commit(node, refs) {
    if (node === null || node === undefined || typeof node !== "object") return;
    for (const item of Array.isArray(node) ? node : [node]) {
      if (item === null || typeof item !== "object" || item.type === undefined) continue;
      if (item.props.ref !== undefined && item.props.ref !== null) {
        const node2 = fakeNode(item, refs);
        item.props.ref.current = node2;
        refs.push(node2);
      }
      commit(item.children, refs);
    }
  }
  function fakeNode(item, refs) {
    return {
      kind: item.props.accept ?? (item.props.className === "dck-trigger" ? "trigger" : "other"),
      click: () => clicks.push(item.props.accept ?? "*"),
      getBoundingClientRect: () => ({ left: 10, top: 700, right: 38, bottom: 728, width: 28, height: 28 }),
      focus: () => {},
    };
  }

  api.render = (component, props) => {
    cursor = 0;
    effects = [];
    const tree = component(props);
    const collected = effects;
    effects = [];
    const refs = [];
    commit(tree, refs);
    return { tree, effects: collected, refs };
  };
  api.clicks = () => clicks;
  api.reset = () => {
    state = [];
    cursor = 0;
  };
  return api;
}

// Walk an element tree the way the reconciler would, without rendering anything.
function findAll(node, predicate, out = []) {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, predicate, out);
    return out;
  }
  if (node.type === undefined) return out;
  if (predicate(node)) out.push(node);
  findAll(node.children, predicate, out);
  return out;
}

const byClass = (name) => (item) => item.props.className === name;
const byRole = (role) => (item) => item.props.role === role;

function load({ language = "zh-CN" } = {}) {
  const react = hooks();
  const inserted = [];
  const removed = [];
  const portals = [];
  const windowListeners = [];
  const documentListeners = [];
  let plugin;

  const document = {
    body: { id: "body" },
    head: { append: (tag) => inserted.push(tag) },
    createElement: () => ({ dataset: {}, textContent: "", remove: () => removed.push(true) }),
    addEventListener: (name) => documentListeners.push(name),
    removeEventListener: () => {},
  };
  const window = {
    innerWidth: 400,
    innerHeight: 800,
    addEventListener: (name) => windowListeners.push(name),
    removeEventListener: () => {},
    __ModuleLoader__: {
      load: (entry) => {
        plugin = entry.factory((name) => {
          if (name === "react") return react;
          if (name === "react-dom") {
            return {
              createPortal: (element, host) => {
                portals.push(host);
                return element;
              },
            };
          }
          if (name === "@deepseek-ai/dsh-client-ui-primitives") {
            return { IconPaperclipOutlineMedium: (props) => ({ type: "svg", props: props ?? {}, children: [] }) };
          }
          throw new Error(`unexpected require(${name})`);
        });
      },
    },
  };

  vm.runInNewContext(source, {
    window,
    document,
    navigator: { language },
    console,
    Symbol,
    queueMicrotask,
  });

  return { plugin, react, inserted, removed, portals, windowListeners, documentListeners };
}

class FakeFile {}

/** The three services the menu reaches for, plus a record of what it asked them to do. */
function services({ cwd = "/root/work", acceptAttachment = true } = {}) {
  const calls = { drafts: [], added: [], released: [], inserted: [], folder: 0 };
  const conversation = {
    input: { shell: () => ({ addFiles: (references, ids) => (calls.added.push({ references, ids }), acceptAttachment) }) },
    createDrafts: (sessionId, files) => {
      calls.drafts.push({ sessionId, files });
      return files.map((file, index) => ({ id: `draft-${index}` }));
    },
    releaseDraftAttachments: (drafts) => calls.released.push(drafts),
  };
  const sessions = { list: { getSnapshot: () => ({ byId: { s1: { cwd } } }) } };
  const workspace = {
    pickDirectory: async () => {
      calls.folder += 1;
      return "/root/work/quoted dir";
    },
  };
  const inputActions = {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }),
    insertText: (text) => (calls.inserted.push(text), true),
  };
  return { calls, conversation, sessions, workspace, inputActions };
}

function apply(lib, { conversation, sessions, workspace }) {
  const registry = [];
  lib.plugin.apply({
    get: (name) =>
      name === "conversation" ? conversation : name === "sessions" ? sessions : name === "uiWorkspace" ? workspace : undefined,
    effect: (fn) => {
      const off = fn();
      registry.push(off);
      return off;
    },
    slots: {
      inject: (name, register) => register(),
      register: (options, component) => {
        registry.push({ options, component });
        return () => {};
      },
    },
  });
  return registry;
}

/** Register the plugin, then mount its seat with the given props. */
function mount(options = {}) {
  const lib = load(options);
  const api = services(options);
  const entry = apply(lib, api).find((item) => item.options);
  const props = { sessionId: "s1", inputActions: api.inputActions };
  const render = () => lib.react.render(entry.component, props);
  return { lib, api, props, render, component: entry.component };
}

test("the browser half returns a plugin that registers one conversation.input.left entry", () => {
  const lib = load();
  assert.deepEqual([...lib.plugin.inject], ["slots"]);

  const registry = apply(lib, services());
  const entry = registry.find((item) => item.options);
  assert.equal(entry.options.name, "conversation.input.left");
  assert.equal(entry.options.id, "dsh-composer-kit.upload-menu");
  assert.equal(entry.options.order, 10);
  assert.equal(typeof entry.component, "function");

  assert.equal(lib.inserted.length, 1, "the stylesheet is installed once");
  assert.equal(lib.inserted[0].dataset.dshComposerKit, "1");
  const off = registry.find((item) => typeof item === "function");
  off();
  assert.equal(lib.removed.length, 1, "removing the effect removes the stylesheet");
});

test("the trigger carries the menu's accessible name and is disabled without a session", () => {
  const mounted = mount();
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  assert.ok(trigger, "the trigger renders");
  assert.equal(trigger.props["aria-label"], "上传菜单");
  assert.equal(trigger.props["aria-haspopup"], "menu");
  assert.equal(trigger.props["aria-expanded"], "false");
  assert.equal(trigger.props.disabled, false);
  assert.deepEqual(mounted.lib.portals, [], "nothing is portalled until the menu opens");

  const dead = mount();
  dead.props.sessionId = undefined;
  dead.props.inputActions = undefined;
  const [idle] = findAll(dead.render().tree, byClass("dck-trigger"));
  assert.equal(idle.props.disabled, true);
  assert.equal(idle.props.title, "会话不可用，无法上传文件");
});

test("the menu lists the four upload sources inside a body portal", () => {
  const mounted = mount();
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  trigger.props.onClick();
  const tree = mounted.render().tree;

  const items = findAll(tree, byRole("menuitem"));
  assert.deepEqual(items.map((item) => item.children[0]), ["图片", "文件", "文件夹", "输入路径"]);
  const [panel] = findAll(tree, byClass("dck-menu"));
  assert.equal(panel.props.style.width, "158px");
  assert.deepEqual(mounted.lib.portals.at(-1), { id: "body" }, "the panel portals out of the composer");
  assert.ok(findAll(tree, byClass("dck-scrim")).length === 1, "a scrim closes the menu on an outside tap");
});

test("picked files go through createDrafts and the shipped attachment rail", () => {
  const mounted = mount();
  const inputs = findAll(mounted.render().tree, (item) => item.props.type === "file");
  assert.equal(inputs.length, 2, "one picker for images, one for files");
  const image = inputs.find((item) => item.props.accept === "image/*");
  assert.equal(image.props.multiple, true);

  const files = [new FakeFile(), new FakeFile()];
  image.props.onChange({ target: { files, value: "picked" } });

  const { drafts, added, released } = mounted.api.calls;
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].sessionId, "s1");
  assert.deepEqual([...drafts[0].files], files);
  assert.equal(added.length, 1);
  assert.deepEqual([...added[0].references], [], "the rail gets attachments, not reference chips");
  assert.deepEqual([...added[0].ids], ["draft-0", "draft-1"]);
  assert.equal(released.length, 0, "an accepted attachment is never released");
});

test("a rejected attachment is released instead of leaking the drafts", () => {
  const mounted = mount({ acceptAttachment: false });
  const [file] = findAll(mounted.render().tree, (item) => item.props.type === "file" && item.props.accept === undefined);
  file.props.onChange({ target: { files: [new FakeFile()], value: "" } });

  const { released, inserted } = mounted.api.calls;
  assert.equal(released.length, 1);
  assert.equal(released[0].length, 1);
  assert.equal(released[0][0].id, "draft-0");
  assert.equal(inserted.length, 0, "a rejected upload inserts nothing");
});

test("输入路径 inserts a relativized mention with the shipped quoting rules", () => {
  const mounted = mount();
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  trigger.props.onClick();
  const items = findAll(mounted.render().tree, byRole("menuitem"));
  items[3].props.onClick();

  const tree = mounted.render().tree;
  const dialog = findAll(tree, (item) => typeof item.type === "function" && item.type.name === "PathDialog")[0];
  assert.ok(dialog, "输入路径 opens the path dialog");
  assert.deepEqual(findAll(tree, byRole("menu")), [], "the menu closes behind it");

  assert.equal(dialog.props.onSubmit("/root/work/plain"), true);
  assert.equal(dialog.props.onSubmit("/root/work/with space/"), true);
  assert.equal(dialog.props.onSubmit("   "), false);
  assert.deepEqual([...mounted.api.calls.inserted], ["@plain ", '@"with space/ ']);
});

test("文件夹 turns the picked directory into a directory mention", async () => {
  const mounted = mount();
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  trigger.props.onClick();
  const items = findAll(mounted.render().tree, byRole("menuitem"));
  items[2].props.onClick();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(mounted.api.calls.folder, 1, "the picker is asked once");
  assert.deepEqual([...mounted.api.calls.inserted], ['@"quoted dir/ ']);
});

test("图片 and 文件 each open their own hidden picker", () => {
  const mounted = mount();
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  trigger.props.onClick();
  findAll(mounted.render().tree, byRole("menuitem"))[0].props.onClick();
  mounted.render();
  const [again] = findAll(mounted.render().tree, byClass("dck-trigger"));
  again.props.onClick();
  findAll(mounted.render().tree, byRole("menuitem"))[1].props.onClick();

  assert.deepEqual(mounted.lib.react.clicks(), ["image/*", "*"]);
});

test("the accessible labels follow the host language", () => {
  const mounted = mount({ language: "en-US" });
  const [trigger] = findAll(mounted.render().tree, byClass("dck-trigger"));
  assert.equal(trigger.props["aria-label"], "Upload menu");
  trigger.props.onClick();
  const items = findAll(mounted.render().tree, byRole("menuitem"));
  assert.deepEqual(items.map((item) => item.children[0]), ["Image", "File", "Folder", "Enter path"]);
});

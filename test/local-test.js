// Runs Code.gs against a fake DocumentApp so the sorting logic can be exercised locally.
const fs = require('fs');
const vm = require('vm');

const TYPES = {
  BODY_SECTION: 'BODY_SECTION',
  LIST_ITEM: 'LIST_ITEM',
  TABLE_CELL: 'TABLE_CELL',
  HEADER_SECTION: 'HEADER_SECTION',
  FOOTER_SECTION: 'FOOTER_SECTION',
  PARAGRAPH: 'PARAGRAPH',
  TEXT: 'TEXT',
};

class FakeText {
  constructor(owner) { this.owner = owner; }
  getType() { return TYPES.TEXT; }
  getParent() { return this.owner; }
}

class FakeListItem {
  constructor(text, level, listId) {
    this.text = text; this.level = level; this.listId = listId; this.parent = null;
  }
  getType() { return TYPES.LIST_ITEM; }
  asListItem() { return this; }
  getText() { return this.text; }
  getNestingLevel() { return this.level; }
  setNestingLevel(l) { this.level = l; return this; }
  setListId(other) { this.listId = other.listId; return this; }
  getParent() { return this.parent; }
  copy() { return new FakeListItem(this.text, this.level, this.listId); }
  removeFromParent() {
    const i = this.parent.children.indexOf(this);
    if (i < 0) throw new Error('detached already');
    this.parent.children.splice(i, 1);
    this.parent = null;
    return this;
  }
  text_() { return new FakeText(this); }
}

class FakeParagraph {
  constructor(text) { this.text = text; this.parent = null; }
  getType() { return TYPES.PARAGRAPH; }
  getParent() { return this.parent; }
  getText() { return this.text; }
}

class FakeContainer {
  constructor(type) { this.type = type || TYPES.BODY_SECTION; this.children = []; }
  getType() { return this.type; }
  getParent() { return null; }
  getChild(i) { return this.children[i]; }
  getNumChildren() { return this.children.length; }
  getChildIndex(c) {
    const i = this.children.indexOf(c);
    if (i < 0) throw new Error('Element does not contain the specified child element.');
    return i;
  }
  insertListItem(i, li) {
    if (li.parent) throw new Error('Cannot insert an attached element.');
    if (i < 0 || i > this.children.length) throw new Error('Index out of bounds: ' + i);
    li.parent = this;
    this.children.splice(i, 0, li);
    return li;
  }
  asBody() { return this; }
  asTableCell() { return this; }
  asHeaderSection() { return this; }
  asFooterSection() { return this; }
  add(child) { child.parent = this; this.children.push(child); return child; }
  dump() {
    return this.children.map(c => '  '.repeat(c.getNestingLevel ? c.getNestingLevel() : 0) +
      (c.getType() === TYPES.LIST_ITEM ? '• ' : '¶ ') + c.getText() +
      (c.listId ? ` [list:${c.listId}]` : ''));
  }
}

function makeDoc(container, selectedElements) {
  const alerts = [];
  let selectionOut = null;
  const doc = {
    getSelection: () => selectedElements === null ? null : ({
      getRangeElements: () => selectedElements.map(e => ({ getElement: () => e })),
    }),
    newRange: () => {
      const els = [];
      const builder = { addElement: e => { els.push(e); return builder; }, build: () => ({ els }) };
      return builder;
    },
    setSelection: r => { selectionOut = r; },
  };
  const DocumentApp = {
    ElementType: TYPES,
    getActiveDocument: () => doc,
    getUi: () => ({
      alert: (title, msg) => alerts.push(msg),
      ButtonSet: { OK: 'OK' },
      createAddonMenu: () => { const m = { addItem: () => m, addToUi: () => m }; return m; },
    }),
  };
  return { DocumentApp, alerts, container, selectionOut: () => selectionOut };
}

const code = fs.readFileSync(__dirname + '/../Code.gs', 'utf8');

function run(container, selected, fn) {
  const env = makeDoc(container, selected);
  const sandbox = { DocumentApp: env.DocumentApp, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  sandbox[fn]();
  return env;
}

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`      expected ${e}\n      actual   ${a}`);
}

// ---- 1. flat list -------------------------------------------------------
{
  const body = new FakeContainer();
  ['carrot', 'apple', 'avocado', 'banana'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  const env = run(body, body.children.slice(), 'sortSelectionAscending');
  check('flat A→Z', body.children.map(c => c.getText()), ['apple', 'avocado', 'banana', 'carrot']);
  check('flat A→Z no alerts', env.alerts, []);
}

// ---- 10. flat list, descending -----------------------------------------
{
  const body = new FakeContainer();
  ['carrot', 'apple', 'avocado', 'banana'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  run(body, body.children.slice(), 'sortSelectionDescending');
  check('flat Z→A', body.children.map(c => c.getText()), ['carrot', 'banana', 'avocado', 'apple']);
}

// ---- 2. nested list -----------------------------------------------------
{
  const body = new FakeContainer();
  const spec = [['carrot', 0], ['orange', 1], ['deep', 2], ['apple', 1], ['apple', 0], ['zebra', 1], ['alpha', 1]];
  spec.forEach(([t, l]) => body.add(new FakeListItem(t, l, 'L1')));
  run(body, body.children.slice(), 'sortSelectionAscending');
  check('nested keeps children with parent',
    body.children.map(c => `${'-'.repeat(c.getNestingLevel())}${c.getText()}`),
    ['apple', '-zebra', '-alpha', 'carrot', '-orange', '--deep', '-apple']);
}

// ---- 5. partial highlight (Text nodes, first/last only) -----------------
{
  const body = new FakeContainer();
  ['carrot', 'apple', 'avocado', 'banana'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  const selected = body.children.map(c => c.text_());
  run(body, selected, 'sortSelectionAscending');
  check('partial highlight via Text nodes', body.children.map(c => c.getText()),
    ['apple', 'avocado', 'banana', 'carrot']);
}

// ---- selection covering a middle span fills in the gap ------------------
{
  const body = new FakeContainer();
  ['delta', 'charlie', 'bravo', 'alpha'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  run(body, [body.children[0].text_(), body.children[3].text_()], 'sortSelectionAscending');
  check('endpoints only → whole run sorts', body.children.map(c => c.getText()),
    ['alpha', 'bravo', 'charlie', 'delta']);
}

// ---- 7. sub-bullets only ------------------------------------------------
{
  const body = new FakeContainer();
  [['parent', 0], ['pear', 1], ['fig', 1], ['date', 1], ['other', 0]].forEach(([t, l]) =>
    body.add(new FakeListItem(t, l, 'L1')));
  run(body, body.children.slice(1, 4), 'sortSelectionAscending');
  check('sub-bullets only', body.children.map(c => c.getText()),
    ['parent', 'date', 'fig', 'pear', 'other']);
}

// ---- orphan sub-bullets pinned -----------------------------------------
{
  const body = new FakeContainer();
  [['carrot', 0], ['orphanB', 1], ['orphanA', 1], ['banana', 0], ['apple', 0]].forEach(([t, l]) =>
    body.add(new FakeListItem(t, l, 'L1')));
  run(body, body.children.slice(1), 'sortSelectionAscending');
  check('leading orphan sub-bullets stay pinned',
    body.children.map(c => `${'-'.repeat(c.getNestingLevel())}${c.getText()}`),
    ['carrot', '-orphanB', '-orphanA', 'apple', 'banana']);
}

// ---- case-insensitive + numeric ----------------------------------------
{
  const body = new FakeContainer();
  ['item 10', 'Item 2', 'item 1', 'Apple', 'apple'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  run(body, body.children.slice(), 'sortSelectionAscending');
  check('case-insensitive + numeric', body.children.map(c => c.getText()),
    ['Apple', 'apple', 'item 1', 'Item 2', 'item 10']);
}

// ---- 9. idempotent ------------------------------------------------------
{
  const body = new FakeContainer();
  ['carrot', 'apple', 'avocado', 'banana'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  run(body, body.children.slice(), 'sortSelectionAscending');
  const once = body.children.map(c => c.getText());
  run(body, body.children.slice(), 'sortSelectionAscending');
  check('idempotent', body.children.map(c => c.getText()), once);
}

// ---- list id preserved --------------------------------------------------
{
  const body = new FakeContainer();
  ['c', 'a', 'b'].forEach(t => body.add(new FakeListItem(t, 0, 'LIST-42')));
  run(body, body.children.slice(), 'sortSelectionAscending');
  check('list id preserved', body.children.map(c => c.listId), ['LIST-42', 'LIST-42', 'LIST-42']);
}

// ---- 8a. no selection ---------------------------------------------------
{
  const body = new FakeContainer();
  ['c', 'a'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  const env = run(body, null, 'sortSelectionAscending');
  check('no selection → unchanged', body.children.map(c => c.getText()), ['c', 'a']);
  check('no selection → alerted', env.alerts.length, 1);
}

// ---- 8b. paragraph in the middle ---------------------------------------
{
  const body = new FakeContainer();
  body.add(new FakeListItem('carrot', 0, 'L1'));
  body.add(new FakeParagraph('a paragraph'));
  body.add(new FakeListItem('apple', 0, 'L2'));
  const env = run(body, [body.children[0], body.children[2]], 'sortSelectionAscending');
  check('paragraph in middle → unchanged', body.children.map(c => c.getText()),
    ['carrot', 'a paragraph', 'apple']);
  check('paragraph in middle → alerted', env.alerts.length, 1);
}

// ---- single bullet ------------------------------------------------------
{
  const body = new FakeContainer();
  body.add(new FakeListItem('solo', 0, 'L1'));
  const env = run(body, body.children.slice(), 'sortSelectionAscending');
  check('single bullet → alerted, unchanged', [body.children.map(c => c.getText()), env.alerts.length],
    [['solo'], 1]);
}

// ---- one parent + children only ----------------------------------------
{
  const body = new FakeContainer();
  [['parent', 0], ['z', 1], ['a', 1]].forEach(([t, l]) => body.add(new FakeListItem(t, l, 'L1')));
  const env = run(body, body.children.slice(), 'sortSelectionAscending');
  check('single block → alerted, unchanged',
    [body.children.map(c => c.getText()), env.alerts.length], [[['parent'], ['z'], ['a']].flat(), 1]);
}

// ---- table cell ---------------------------------------------------------
{
  const cell = new FakeContainer(TYPES.TABLE_CELL);
  ['c', 'a', 'b'].forEach(t => cell.add(new FakeListItem(t, 0, 'L1')));
  const env = run(cell, cell.children.slice(), 'sortSelectionAscending');
  check('table cell', [cell.children.map(c => c.getText()), env.alerts], [['a', 'b', 'c'], []]);
}

// ---- list not at the start of the body ---------------------------------
{
  const body = new FakeContainer();
  body.add(new FakeParagraph('heading'));
  ['carrot', 'apple', 'banana'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  body.add(new FakeParagraph('footer text'));
  run(body, body.children.slice(1, 4), 'sortSelectionAscending');
  check('list mid-body', body.children.map(c => c.getText()),
    ['heading', 'apple', 'banana', 'carrot', 'footer text']);
}

// ---- blank bullets ------------------------------------------------------
{
  const body = new FakeContainer();
  ['carrot', '', 'apple'].forEach(t => body.add(new FakeListItem(t, 0, 'L1')));
  const env = run(body, body.children.slice(), 'sortSelectionAscending');
  check('blank bullet sorts first', [body.children.map(c => c.getText()), env.alerts],
    [['', 'apple', 'carrot'], []]);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);

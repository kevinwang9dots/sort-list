/**
 * Sort Bullets — a Google Docs add-on that alphabetises the highlighted bullet list.
 *
 * Top-level bullets in the highlight are sorted. Every sub-bullet stays attached to its own
 * parent bullet and keeps its original position within that parent.
 */

/** Builds the menu whenever a document is opened. */
function onOpen(e) {
  DocumentApp.getUi()
      .createAddonMenu()
      .addItem('Sort selected list A → Z', 'sortSelectionAscending')
      .addItem('Sort selected list Z → A', 'sortSelectionDescending')
      .addToUi();
}

/** Runs once when the add-on is installed. */
function onInstall(e) {
  onOpen(e);
}

function sortSelectionAscending() {
  sortSelectedList_(false);
}

function sortSelectionDescending() {
  sortSelectedList_(true);
}

/**
 * Sorts the bullet list covered by the current selection.
 * @param {boolean} descending Sort Z to A instead of A to Z.
 */
function sortSelectedList_(descending) {
  var doc = DocumentApp.getActiveDocument();
  var selection = doc.getSelection();
  if (!selection) {
    alert_('Highlight the bullet points you want to sort, then run this again.');
    return;
  }

  var found;
  try {
    found = collectSelectedListItems_(selection);
  } catch (err) {
    alert_(err.message);
    return;
  }

  if (found.items.length < 2) {
    alert_('Highlight at least two bullet points to sort.');
    return;
  }

  var grouped = groupIntoBlocks_(found.items);
  if (grouped.blocks.length < 2) {
    alert_('Nothing to sort — the highlighted bullets all sit under a single parent bullet.');
    return;
  }

  grouped.blocks.sort(function (a, b) {
    var order = compareText_(a.sortKey, b.sortKey);
    return descending ? -order : order;
  });

  // Sub-bullets whose parent was left out of the highlight stay at the top, untouched.
  var ordered = grouped.pinned.slice();
  grouped.blocks.forEach(function (block) {
    ordered = ordered.concat(block.members);
  });

  rewriteList_(doc, found, ordered);
}

/**
 * Resolves the selection to a contiguous run of list items inside one container.
 * @param {Selection} selection The active selection.
 * @return {{container: ContainerElement, endIndex: number, items: ListItem[]}}
 */
function collectSelectedListItems_(selection) {
  var rangeElements = selection.getRangeElements();
  var parent = null;
  var minIndex = -1;
  var maxIndex = -1;

  for (var i = 0; i < rangeElements.length; i++) {
    var listItem = enclosingListItem_(rangeElements[i].getElement());
    if (!listItem) {
      continue;
    }
    if (!parent) {
      parent = listItem.getParent();
    }

    // A list item from a different container makes the run ambiguous, so bail out.
    var index = -1;
    try {
      index = parent.getChildIndex(listItem);
    } catch (err) {
      index = -1;
    }
    if (index < 0) {
      throw new Error('The highlight spans more than one container (for example a table cell and the ' +
                      'body). Select bullets from a single list.');
    }

    if (minIndex < 0 || index < minIndex) {
      minIndex = index;
    }
    if (index > maxIndex) {
      maxIndex = index;
    }
  }

  if (!parent || minIndex < 0) {
    throw new Error('No bullet points found in the highlight. Select the list items you want to sort.');
  }

  var items = [];
  for (var j = minIndex; j <= maxIndex; j++) {
    var child = parent.getChild(j);
    if (child.getType() !== DocumentApp.ElementType.LIST_ITEM) {
      throw new Error('The highlight contains a line that is not a bullet point (a blank line or a ' +
                      'paragraph in the middle of the list). Select a single, unbroken list.');
    }
    items.push(child.asListItem());
  }

  return {container: parent, endIndex: maxIndex, items: items};
}

/**
 * Walks up from an element until it finds the list item that contains it.
 * Range elements are often Text nodes, so the selection alone is not enough.
 * @return {ListItem|null}
 */
function enclosingListItem_(element) {
  var current = element;
  while (current) {
    if (current.getType() === DocumentApp.ElementType.LIST_ITEM) {
      return current.asListItem();
    }
    current = current.getParent();
  }
  return null;
}

/**
 * Groups the items into sortable blocks: one top-level bullet plus the deeper bullets under it.
 * @param {ListItem[]} items Items in document order.
 * @return {{pinned: ListItem[], blocks: Array<{sortKey: string, members: ListItem[]}>}}
 */
function groupIntoBlocks_(items) {
  var topLevel = items[0].getNestingLevel();
  items.forEach(function (item) {
    topLevel = Math.min(topLevel, item.getNestingLevel());
  });

  var pinned = [];
  var blocks = [];
  items.forEach(function (item) {
    if (item.getNestingLevel() === topLevel) {
      blocks.push({sortKey: item.getText(), members: [item]});
    } else if (blocks.length === 0) {
      // Leading sub-bullets belong to a parent outside the highlight; leave them where they are.
      pinned.push(item);
    } else {
      blocks[blocks.length - 1].members.push(item);
    }
  });

  return {pinned: pinned, blocks: blocks};
}

/**
 * Compares two bullet texts: case-insensitive, and "item 2" before "item 10".
 * @return {number}
 */
function compareText_(a, b) {
  var left = a.trim();
  var right = b.trim();
  var order = left.localeCompare(right, undefined, {numeric: true, sensitivity: 'base'});
  if (order !== 0) {
    return order;
  }
  return left < right ? -1 : (left > right ? 1 : 0);
}

/**
 * Replaces the original run of list items with the same items in their new order.
 * Copies are inserted before the originals are removed so the list keeps its glyphs, numbering
 * and inline formatting.
 * @param {Document} doc The active document.
 * @param {{container: ContainerElement, endIndex: number, items: ListItem[]}} found
 * @param {ListItem[]} ordered The same items, sorted.
 */
function rewriteList_(doc, found, ordered) {
  var container = asInsertableContainer_(found.container);
  if (!container) {
    alert_('This list sits somewhere the add-on cannot rewrite. Try a list in the document body, a ' +
           'table cell, or a header or footer.');
    return;
  }

  var originals = found.items;
  var anchor = originals[0];
  var inserted = [];

  for (var i = 0; i < ordered.length; i++) {
    var source = ordered[i];
    var item = container.insertListItem(found.endIndex + 1 + i, source.copy());
    item.setListId(anchor);  // keeps bullet glyphs and numbering continuous
    item.setNestingLevel(source.getNestingLevel());
    inserted.push(item);
  }

  for (var j = originals.length - 1; j >= 0; j--) {
    originals[j].removeFromParent();
  }

  try {
    var range = doc.newRange();
    inserted.forEach(function (item) {
      range.addElement(item);
    });
    doc.setSelection(range.build());
  } catch (err) {
    // Re-highlighting is only a convenience; the sort itself already succeeded.
  }
}

/**
 * Casts a container to a concrete type that supports insertListItem().
 * @return {Body|TableCell|HeaderSection|FooterSection|null}
 */
function asInsertableContainer_(container) {
  switch (container.getType()) {
    case DocumentApp.ElementType.BODY_SECTION:
      return container.asBody();
    case DocumentApp.ElementType.TABLE_CELL:
      return container.asTableCell();
    case DocumentApp.ElementType.HEADER_SECTION:
      return container.asHeaderSection();
    case DocumentApp.ElementType.FOOTER_SECTION:
      return container.asFooterSection();
    default:
      return null;
  }
}

function alert_(message) {
  var ui = DocumentApp.getUi();
  ui.alert('Sort Bullets', message, ui.ButtonSet.OK);
}

/*
 UI components 
 (c) Sean Hogan, 2008,2012
 All rights reserved.
 Assumes Binding.js already loaded
*/

Meeko.UI = (function() {

var _ = Meeko.stuff, extend = _.extend, forEach = _.forEach;
var DOM = Meeko.DOM, $id = DOM.$id, $ = DOM.$, $$ = DOM.$$;
var xbl = Meeko.xbl, Binding = xbl.Binding, baseBinding = xbl.baseBinding;

var box = (function() {
	
var box = baseBinding.create();
var prototype = box.prototype;
extend(prototype, {

setHidden: function(state) {
	var element = this.boundElement;
	element.hidden = !!state;
},

getHidden: function() {
	var element = this.boundElement;
	return element.hidden;
}

});

Object.defineProperties(prototype, {

hidden: { get: prototype.getHidden, set: prototype.setHidden }

});

return box;

})();


var treeitem = (function() {

var treeitem = baseBinding.create();
var prototype = treeitem.prototype;
extend(prototype, {

getListElement: function() {

	var element = this.boundElement;
	var children = element.children;
	for (var node, i=0; node=children.item(i); i++) {
		switch (node.tagName.toLowerCase()) {
			case "ol": case "ul": case "select": return node;	
		}
	}	
	return null;
		
},
setSelected: function(state) { // NOTE treeitem is ignorant of whether multiple treeitems can be selected
	var element = this.boundElement;
	element.setAttribute("aria-selected", !!state);
},
getSelected: function() {
	var element = this.boundElement;
	var state = element.getAttribute("aria-selected");
	return (/^true$/i.test(state));	
},
setExpanded: function(state) {
	
	var element = this.boundElement;
	var listEl = this.getListElement();
	if (!listEl) throw "";
	list.getBindingFor(listEl).setHidden(state);

},
getExpanded: function() {
	
	var element = this.boundElement;
	var listEl = this.getListElement();
	if (!listEl) throw "";
	return list.getBindingFor(listEl).getHidden();

}

});

Object.defineProperties(prototype, {

listElement: { get: prototype.getListElement },
selected: { get: prototype.getSelected, set: prototype.setSelected },
expanded: { get: prototype.getExpanded, set: prototype.setExpanded }

});

return treeitem;

})();

var listitem = treeitem;

var list = (function() {
	
var list = box.create();
var prototype = list.prototype;

extend(prototype, {

getItems: function() {
	
	var element = this.boundElement;
	return element.children;

},

setHidden: function(state) {
	var element = this.boundElement;
	element.hidden = !!state;
},

getHidden: function() {
	var element = this.boundElement;
	return element.hidden;
}

});

Object.defineProperties(prototype, {

hidden: { get: prototype.getHidden, set: prototype.setHidden }

});

return list;

})();


var tree = (function() {

var tree = box.create();
var prototype = tree.prototype;

extend(prototype, {

getListElement: treeitem.prototype.getListElement,

getSelectedItem: function() { // FIXME this only searches the top list, not the whole tree

	var items = list.getBindingFor(this.getListElement()).getItems();
	var n = items.length;
	for (var i=0; i<n; i++) {
		var node = items.item(i);
		var binding = treeitem.getBindingFor(node);
		if (binding.getSelected()) return node;
	}
	return null;
		
},
selectItem: function(item) {

	var listEl = this.getListElement();
	if (item && item.parentNode != listEl) throw "Element doesn't exist in list";
	var items = list.getBindingFor(listEl).getItems();
	var n = items.length;
	for (var i=0; i<n; i++) {
		var node = items[i];
		var binding = treeitem.getBindingFor(node);
		if (node === item) binding.setSelected(true);
		if (node !== item) binding.setSelected(false);
	}
	this.signalChange();
		
},
signalChange: function() {
	
	var element = this.boundElement;
	var document = element.ownerDocument;
	var event = document.createEvent("Event");
	event.initEvent("change", false, true);
	return element.dispatchEvent(event);
			
}

});

Object.defineProperties(prototype, {

listElement: { get: prototype.getListElement },
selectedIndex: { get: prototype.getSelectedIndex },
selectedItem: { get: prototype.getSelectedItem }

});

tree.addHandler({
type: "click",
action: function(event) {
	var element = this.boundElement;
	var item = event.target;
	while (item.tagName.toLowerCase() != "li") {
		if (item == element) return;
		item = item.parentNode;
	}
	this.selectItem(item);
}
});

return tree;
})();


var navtreeitem = (function() {

var navtreeitem = treeitem.create();
var prototype = navtreeitem.prototype;
extend(prototype, {

getView: function() {
	
	var element = this.boundElement;
	var document = element.ownerDocument;
	var ref = this.boundElement.firstElementChild;
	var tagName = ref.tagName.toLowerCase();
	switch(tagName) {
	case "a":
		if (!ref.getAttribute("href")) break;
		var href = ref.href;
//		var base = document.documentURI + "#";
		var base = document.URL + "#";
		if (href.indexOf(base) != 0) break;
		var id = href.replace(base, "");
		return $id(id);
		break;
	case "label":
		var id = ref.htmlFor;
		if (id) return $id(id);
		break;
	}
	return null;
			
}
	
});
Object.defineProperties(prototype, {

view: { get: prototype.getView }

});

return navtreeitem;
})();



var navtree = (function() {
var navtree = tree.create();
var prototype = navtree.prototype;
extend(prototype, {

getView: navtreeitem.prototype.getView
	
});
Object.defineProperties(prototype, {

view: { get: prototype.getView }

});

navtree.addHandler({

type: "click",
action: function(event) {
	var element = this.boundElement;
	var item = event.target;
	while (item.tagName.toLowerCase() != "li") {
		if (item == element) return;
		item = item.parentNode;
	}
	this.selectItem(item);
}

});


return navtree;
})();


var scrollBox = (function() {
var scrollBox = box.create();
var prototype = scrollBox.prototype;
extend(prototype, {
	
setView: function(item) {

	var element = this.boundElement;
	var document = element.ownerDocument;
	if (element.compareDocumentPosition(node) & 0x10) { // Node.DOCUMENT_POSITION_CONTAINED_BY
		throw "setView failed: item is not descendant of scrollBox";
	}

	element.scrollTop = item.offsetTop - element.offsetTop;

			
}

});
return scrollBox;
})();


var scrollBoxWithResize = (function() {

var scrollBoxWithResize = box.create();
var prototype = scrollBoxWithResize.prototype;
extend(prototype, {
	
setView: function(item) {

	var element = this.boundElement;
	var document = element.ownerDocument;
	if (element.compareDocumentPosition(node) & 0x10) { // Node.DOCUMENT_POSITION_CONTAINED_BY
		throw "setView failed: item is not descendant of scrollBoxWithResize";
	}
	element.style.height = "" + item.clientHeight + "px";
	element.scrollTop = item.offsetTop - element.offsetTop;

			
},
xblBindingAttached: function() {
	
	var element = this.boundElement;
	var elementHeight = element.clientHeight;
	element.style.overflow = "hidden";
	element.style.height = "0px";

}

})

return scrollBoxWithResize;
})();


var panel = box;

var switchBox = (function() {
	
var switchBox = box.create();
var prototype = switchBox.prototype;

extend(prototype, {

_getPanels: function() {
	return this.boundElement.children;
},
setView: function(item) {
	
	var element = this.boundElement;
	if (item && element != item.parentNode) throw "setView failed: item is not child of switchBox";
	var panels = this._getPanels();
	forEach(panels, function(child) {
		var binding = panel.getBindingFor(child);
		if (item == child) binding.setHidden(false);
		else binding.setHidden(true);
	});
			
},
setViewByIndex: function(index) {

	var panels = this._getPanels();
	if (index >= panels.length) throw "setViewByIndex failed: index is not valid for switchBox";
	forEach(panels, function(child, i) {
		var binding = panel.getBindingFor(child);
		if (index == i) binding.setHidden(false);
		else binding.setHidden(true);
	});
	return;

},
xblBindingAttached: function() {
	this.setView();
}

});

return switchBox;
})();



var table = (function() {

var table = box.create();
var prototype = table.prototype;

extend(prototype, {
	
getColumns: function() {
	
	var element = this.boundElement;
	return element.tHead.rows.item(0).cells;
			
},
_sort: function(column, type, reverse) {
	

	var element = this.boundElement;
	var tBodies = element.tBodies;
	for (var j=0, m=tBodies.length; j<m; j++) {
		var tBody = tBodies.item(j);
		var rows = tBody.rows;
		var values = [];
		for (var i=0, n=rows.length; i<n; i++) {
			var row = rows.item(i); var cell = row.cells.item(column);
			var val = String(cell.firstChild.nodeValue);
			val.row = row;
			values.push(val);
		}
		switch (type) {
			case "string":
				values = values.sort();
				break;
			case "number":
				values = values.sort(function(a, b) { return Number(a) - Number(b); });
				break;
			default:
				throw "Unrecognized sort type: " + type;
				break;
		}
		if (reverse) values = values.reverse();
		for (var n=values.length, i=0; i<n; i++) {
			var val = values[i];
			var row = val.row;
			tBody.removeChild(row);
			if (i == n-1) tBody.appendChild(row);
			else tBody.insertBefore(row, tBody.rows.item(i));
		}
	}

			
},
toggleColumnSortState: function(column) { // TODO shouldn't have hard-wired classes

	var type = "string";
	var cols = this.getColumns();
	var classList = cols.item(column).classList; // TODO classList isn't backwards compat
	if (classList.contains("number")) type = "number";
	if (classList.contains("string")) type = "string";
	var sortable = classList.contains("sortable");
	var sorted = classList.contains("sorted");
	var reversed = classList.contains("reversed");
	if (!sortable) return;
	if (!sorted) {
		this._sort(column, type, false);
		classList.add("sorted");
		classList.remove("reversed");
	}
	else {
		this._sort(column, type, !reversed);
		if (reversed) classList.remove("reversed");
		else classList.add("reversed");
	}
	for (var n=cols.length, i=0; i<n; i++) {
		if (column != i) {
			var classList = cols.item(i).classList;
			classList.remove("sorted");
			classList.remove("reversed");
		}
	}
	
}

});

return table;
})();

var WF2FormElement = (function() {
	
var WF2FormElement = baseBinding.create();
var prototype = WF2FormElement.prototype;

extend(prototype, {
encode: function() {

var a = [];
forEach(this.elements, function(el) {
	if (el.name) a.push(el.name + "=" + encodeURIComponent(el.value));
});
var txt = a.join('&');
return txt;
			
}
});

return WF2FormElement;
})();



return {
	list: list,
	treeitem: treeitem, 
	tree: tree, 
	navtreeitem: navtreeitem, 
	navtree: navtree,
	panel: panel,
	scrollBox: scrollBox, 
	scrollBoxWithResize: scrollBoxWithResize, 
	switchBox: switchBox, 
	table: table, 
	WF2FormElement: WF2FormElement	
}

})();

/*!
 UI components 
 (c) Sean Hogan, 2008,2012,2014
 Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
*/

/* NOTE
	+ Assumes Sprocket.js already loaded
*/
/* TODO
	+ Ideally this would be ARIA.js
*/

Meeko.sprockets.UI = (function() {

var _ = Meeko.stuff, DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, Base = sprockets.Base, RoleType = sprockets.RoleType;

var declareProperties = (Object.defineProperty && Object.create) ? // IE8 supports defineProperty but only on DOM objects
function(obj, props) {
	_.forEach(_.words(props), function(prop) {
		var Prop = ucFirst(prop);
		var getterName = 'get' + Prop;
		var getter = obj[getterName];
		if (typeof getter !== 'function') getter = function() { throw 'Attempt to read write-only property'; }
		var setterName = 'set' + Prop;
		var setter = obj[setterName];
		if (typeof setter !== 'function') setter = function() { throw 'Attempt to write read-only property'; }
		Object.defineProperty(obj, prop, {
			get: getter,
			set: setter
		});
	});
} :
function(obj, props) { };

function ucFirst(text) {
	return text.substr(0,1).toUpperCase() + text.substr(1);
}

var Box = sprockets.evolve(RoleType, {

setHidden: function(state) {
	var element = this.element;
	if (!state) element.removeAttribute('hidden');
	else element.setAttribute('hidden', '');
},

getHidden: function() {
	var element = this.element;
	return element.getAttribute('hidden') !== null;
}

});

declareProperties(Box.prototype, 'hidden');

var TreeItem = sprockets.evolve(Box, {

getListElement: function() {

	var element = this.element;
	var children = element.children;
	for (var node, i=0; node=children[i]; i++) {
		switch (node.tagName.toLowerCase()) {
			case "ol": case "ul": case "select": return node;	
		}
	}	
	return null;
		
},
setSelected: function(state) { // NOTE TreeItem is ignorant of whether multiple TreeItems can be selected
	var element = this.element;
	element.setAttribute("aria-selected", !!state);
},
getSelected: function() {
	var element = this.element;
	var state = element.getAttribute("aria-selected");
	return (/^true$/i.test(state));	
},
setExpanded: function(state) {	
	var listEl = this.getListElement();
	if (!listEl) throw "";
	List(listEl).setHidden(!state);
},
getExpanded: function() {
	var listEl = this.getListElement();
	if (!listEl) throw "";
	return List(listEl).getHidden();
}

});

declareProperties(TreeItem.prototype, 'listElement selected expanded');

var ListItem = TreeItem;

var List = sprockets.evolve(Box, {

getItems: function() {
	var element = this.element;
	var items = [];
	for (var node=element.firstChild; node; node=node.nextSibling) {
		if (node.nodeType === 1) items.push(node);
	}
	return items;
}

});

declareProperties(List.prototype, 'items');

var Tree = sprockets.evolve(Box, {

getListElement: TreeItem.prototype.getListElement,

getItems: function() {
	return List(this.getListElement()).getItems();
},

getSelectedItem: function() { // FIXME this only searches the top List, not the whole Tree

	var items = this.getItems();
	var n = items.length;
	for (var i=0; i<n; i++) {
		var node = items[i];
		var binding = TreeItem(node);
		if (binding.getSelected()) return node;
	}
	return null;
		
},
selectItem: function(item) {

	var items = this.getItems();
	if (!_.contains(items, item)) throw "Element doesn't exist in list";
	var n = items.length;
	for (var i=0; i<n; i++) {
		var node = items[i];
		var binding = TreeItem(node);
		if (node === item) binding.setSelected(true);
		if (node !== item) binding.setSelected(false);
	}
	this.signalChange();
		
},
signalChange: function() {
	this.trigger({
		type: 'change'
	});
}

});

declareProperties(Tree.prototype, 'listElement selectedItem');


var NavTreeItem = sprockets.evolve(TreeItem, {

getView: function() {
	
	var element = this.element;
	var document = element.ownerDocument;
	for (var ref=this.element.firstChild; ref; ref=ref.nextSibling) if (ref.nodeType === 1) break;
	var tagName = ref && ref.tagName.toLowerCase();
	switch(tagName) {
	case "a":
		if (!ref.getAttribute("href")) break;
		var href = ref.href;
		var base = document.URL.replace(/#.*$/, '')  + "#";
		if (href.indexOf(base) != 0) break;
		var id = href.replace(base, "");
		return DOM.findId(id);
		break;
	case "label":
		var id = ref.htmlFor;
		if (id) return DOM.findId(id);
		break;
	}
	return null;
			
}
	
});

declareProperties(NavTreeItem.prototype, 'view');


var NavTree = sprockets.evolve(Tree, {

getView: NavTreeItem.prototype.getView
	
});

declareProperties(NavTree.prototype, 'view');


var ScrollBox = sprockets.evolve(Box, {
	
setView: function(item) {

	var element = this.element;
	if (element === item || !this.contains(item)) throw "setView failed: item is not descendant of ScrollBox";
	element.scrollTop = item.offsetTop - element.offsetTop;

}

});

declareProperties(ScrollBox.prototype, 'view');


var ScrollBoxWithResize = sprockets.evolve(Box, {
	
setView: function(item) {

	var element = this.element;
	var document = element.ownerDocument;
	if (element === item || !this.contains(node)) {
		throw "setView failed: item is not descendant of ScrollBoxWithResize";
	}
	element.style.height = "" + item.clientHeight + "px";
	element.scrollTop = item.offsetTop - element.offsetTop;
			
},
initialize: function() {
	
	var element = this.element;
	element.style.overflow = "hidden";
	element.style.height = "0px";

}

});


declareProperties(ScrollBoxWithResize.prototype, 'view');


var Panel = Box;

var SwitchBox = sprockets.evolve(Box, {

getPanels: function() {
	return this.element.children;
},
setView: function(item) {
	
	var element = this.element;
	var panels = this.getPanels();
	if (!_.contains(panels, item)) throw "setView failed: item is not child of SwitchBox";
	_.forEach(panels, function(child) {
		var binding = Panel(child);
		if (item == child) binding.setHidden(false);
		else binding.setHidden(true);
	}, this);

},
setViewByIndex: function(index) {

	var panels = this.getPanels();
	if (index >= panels.length) throw "setViewByIndex failed: index is not valid for SwitchBox";
	_.forEach(panels, function(child, i) {
		var binding = Panel(child);
		if (index == i) binding.setHidden(false);
		else binding.setHidden(true);
	}, this);
	return;

},
initialize: function() {
	this.setView();
}

});

declareProperties(SwitchBox.prototype, 'view');


var Table = sprockets.evolve(Box, { // FIXME uses className. This shouldn't be hard-wired
	
getTable: function() {
	var element = this.element;
	if (element.tagName.toLowerCase() === 'table') return element;
	return DOM.find('table', element);
},

getColumns: function() {
	
	var table = this.getTable();
	return table.tHead.rows[0].cells;
			
},
sort: function(column, type, reverse) {
	

	var table = this.getTable();
	var tBodies = table.tBodies;
	for (var j=0, m=tBodies.length; j<m; j++) {
		var tBody = tBodies[j];
		var rows = tBody.rows;
		var values = [];
		for (var i=0, n=rows.length; i<n; i++) {
			var row = rows[i]; var cell = row.cells[column];
			var val = new String(cell.firstChild.nodeValue);
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
			else tBody.insertBefore(row, tBody.rows[i]);
		}
	}

},
toggleColumnSortState: function(column) { // TODO shouldn't have hard-wired classes

	var type = "string";
	var cols = this.getColumns();
	var colEl = cols[column];
	var col = new Base(colEl);
	if (col.hasClass("number")) type = "number";
	if (col.hasClass("string")) type = "string";
	var sortable = col.hasClass("sortable");
	var sorted = col.hasClass("sorted");
	var reversed = col.hasClass("reversed");
	if (!sortable) return;
	if (!sorted) {
		this.sort(column, type, false);
		col.addClass("sorted");
		col.removeClass("reversed");
	}
	else {
		this.sort(column, type, !reversed);
		if (reversed) col.removeClass("reversed");
		else col.addClass("reversed");
	}
	for (var n=cols.length, i=0; i<n; i++) {
		if (column != i) {
			colEl = cols[i];
			col = new Base(colEl);
			col.removeClass("sorted");
			col.removeClass("reversed");
		}
	}
	
}

});

var WF2FormElement = sprockets.evolve(RoleType, {
encode: function() {

var a = [];
_.forEach(this.elements, function(el) {
	if (el.name) a.push(el.name + "=" + encodeURIComponent(el.value));
});
var txt = a.join('&');
return txt;
			
}
});


return {
	Base: Base,
	Box: Box,
	List: List,
	TreeItem: TreeItem, 
	Tree: Tree, 
	NavTreeItem: NavTreeItem, 
	NavTree: NavTree,
	Panel: Panel,
	ScrollBox: ScrollBox, 
	ScrollBoxWithResize: ScrollBoxWithResize, 
	SwitchBox: SwitchBox, 
	Table: Table, 
	WF2FormElement: WF2FormElement	
}

})();

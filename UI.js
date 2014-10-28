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

var _ = Meeko.stuff;
var DOM = Meeko.DOM, $id = DOM.$id, $ = DOM.$, $$ = DOM.$$;
var sprockets = Meeko.sprockets, Base = sprockets.Base, BasePrototype = Base.prototype;

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

var BoxPrototype = _.create(BasePrototype, {

setHidden: function(state) {
	var element = this.element;
	if (!state) element.removeAttribute('hidden');
	else element.setAttribute('hidden', '');
},

getHidden: function() {
	var element = this.element;
	return element.hasAttribute('hidden');
}

});

declareProperties(BoxPrototype, 'hidden');
var Box = sprockets.register('ui-box', { prototype: BoxPrototype });
sprockets.register('[is=ui-box]', { prototype: BoxPrototype });

var TreeItemPrototype = _.create(BoxPrototype, {

getListElement: function() {

	var element = this.element;
	return this.$('ul');

},
setSelected: function(state) { // NOTE TreeItem is ignorant of whether multiple TreeItems can be selected
	var element = this.element;
	if (!state) element.removeAttribute('aria-selected');
	else element.setAttribute("aria-selected", 'true');
},
getSelected: function() {
	var element = this.element;
	var state = element.getAttribute("aria-selected");
	if (!state) return false;
	return (/^true$/i.test(state));	
},
setExpanded: function(state) {	
	var listEl = this.getListElement();
	if (!listEl) throw "Item not expandable";
	this.element.setAttribute('aria-expanded', !!state);
	List(listEl).setHidden(!state);
},
getExpanded: function() {
	var listEl = this.getListElement();
	if (!listEl) return;
	return !List(listEl).getHidden();
}

});

declareProperties(TreeItemPrototype, 'listElement selected expanded');
var TreeItem = sprockets.register('ui-treeitem', { prototype: TreeItemPrototype });
sprockets.register('[is=ui-treeitem]', { prototype: TreeItemPrototype });

var ListItemPrototype = TreeItemPrototype;
var ListItem = sprockets.register('ui-listitem', { prototype: ListItemPrototype });
sprockets.register('[is=ui-listitem]', { prototype: ListItemPrototype });

var ListPrototype = _.create(BoxPrototype, {

getItems: function() {
	var element = this.element;
	var items = [];
	for (var node=element.firstChild; node; node=node.nextSibling) {
		if (node.nodeType === 1) items.push(node);
	}
	return items;
}

});

declareProperties(ListPrototype, 'items');
var List = sprockets.register('ui-list', { prototype: ListPrototype });
sprockets.register('[is=ui-list]', { prototype: ListPrototype });

var TreePrototype = _.create(BoxPrototype, {

getListElement: TreeItemPrototype.getListElement,

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

declareProperties(TreePrototype, 'listElement selectedItem');
var Tree = sprockets.register('ui-tree', { prototype: TreePrototype });
sprockets.register('[is=ui-tree]', { prototype: TreePrototype });


var ScrollBoxPrototype = _.create(BoxPrototype, {
	
setView: function(item) {

	var element = this.element;
	if (element === item || !this.contains(item)) throw "setView failed: item is not descendant of ScrollBox";
	element.scrollTop = item.offsetTop - element.offsetTop;

}

});

declareProperties(ScrollBoxPrototype, 'view');
var ScrollBox = sprockets.register('ui-scrollbox', { prototype: ScrollBoxPrototype });
sprockets.register('[is=ui-scrollbox]', { prototype: ScrollBoxPrototype });


var ScrollBoxWithResizePrototype = _.create(BoxPrototype, {
	
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


declareProperties(ScrollBoxWithResizePrototype, 'view');
var ScrollBoxWithResize = sprockets.register('ui-scrollboxwithresize', { prototype: ScrollBoxWithResizePrototype });
sprockets.register('[is=ui-scrollboxwithresize]', { prototype: ScrollBoxWithResizePrototype });


var PanelPrototype = BoxPrototype;
var Panel = sprockets.register('ui-panel', { prototype: PanelPrototype });
sprockets.register('[is=ui-panel]', { prototype: PanelPrototype });

var SwitchBoxPrototype = _.create(BoxPrototype, {

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

declareProperties(SwitchBoxPrototype, 'view');
var SwitchBox = sprockets.register('ui-switchbox', { prototype: SwitchBoxPrototype });
sprockets.register('[is=ui-switchbox]', { prototype: SwitchBoxPrototype });


var TablePrototype = _.create(BoxPrototype, { // FIXME uses className. This shouldn't be hard-wired
	
getColumns: function() {
	
	var element = this.element;
	return element.tHead.rows.item(0).cells;
			
},
sort: function(column, type, reverse) {
	
	var element = this.element;
	var tBodies = element.tBodies;
	for (var j=0, m=tBodies.length; j<m; j++) {
		var tBody = tBodies.item(j);
		var rows = tBody.rows;
		var values = [];
		for (var i=0, n=rows.length; i<n; i++) {
			var row = rows.item(i); var cell = row.cells.item(column);
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
			else tBody.insertBefore(row, tBody.rows.item(i));
		}
	}

},
toggleColumnSortState: function(column) { // TODO shouldn't have hard-wired classes

	var type = "string";
	var cols = this.getColumns();
	var colEl = cols.item(column);
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
			colEl = cols.item(i);
			col = new Base(colEl);
			col.removeClass("sorted");
			col.removeClass("reversed");
		}
	}
	
}

});

var Table = sprockets.register('ui-table', { prototype: TablePrototype });
sprockets.register('[is=ui-table]', { prototype: TablePrototype });

return {
	Base: Base,
	Box: Box,
	List: List,
	TreeItem: TreeItem, 
	Tree: Tree, 
	Panel: Panel,
	ScrollBox: ScrollBox, 
	ScrollBoxWithResize: ScrollBoxWithResize, 
	SwitchBox: SwitchBox, 
	Table: Table
}

})();

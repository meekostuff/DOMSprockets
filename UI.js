/*
 UI components 
 (c) Sean Hogan, 2008,2012
 All rights reserved.
 Assumes Sprocket.js already loaded
*/

Meeko.UI = (function() {

var _ = Meeko.stuff, extend = _.extend, forEach = _.forEach;
var DOM = Meeko.DOM, $id = DOM.$id, $ = DOM.$, $$ = DOM.$$;
var sprockets = Meeko.sprockets, BaseSprocket = sprockets.BaseSprocket;

var declareProperties = (Object.defineProperty && Object.create) ? // IE8 supports defineProperty but only on DOM objects
function(obj, props) {
	forEach(props.split(/\s+/), function(prop) {
		var Prop = ucFirst(prop);
		var getter = 'get' + Prop, setter = 'set' + Prop;
		Object.defineProperty(obj, prop, {
			get: obj[getter],
			set: obj[setter]
		});
	});
} :
function(obj, props) { };

function ucFirst(text) {
	return text.substr(0,1).toUpperCase() + text.substr(1);
}

var Box = BaseSprocket.evolve({

setHidden: function(state) {
	var element = this.boundElement;
	element.hidden = !!state;
},

getHidden: function() {
	var element = this.boundElement;
	return element.hidden;
}

});

declareProperties(Box.prototype, 'hidden');

var TreeItem = BaseSprocket.evolve({

listSprocket: List,
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
setSelected: function(state) { // NOTE TreeItem is ignorant of whether multiple TreeItems can be selected
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
	this.listSprocket(listEl).setHidden(!state);

},
getExpanded: function() {
	
	var element = this.boundElement;
	var listEl = this.getListElement();
	if (!listEl) throw "";
	return this.listSprocket(listEl).getHidden();

}

});

declareProperties(TreeItem.prototype, 'listElement selected expanded');

var ListItem = TreeItem;

var List = Box.evolve({

getItems: function() {
	
	var element = this.boundElement;
	return element.children;

}

});

declareProperties(List.prototype, 'hidden');


var Tree = Box.evolve({

getListElement: TreeItem.prototype.getListElement,

getSelectedItem: function() { // FIXME this only searches the top List, not the whole Tree

	var items = List(this.getListElement()).getItems();
	var n = items.length;
	for (var i=0; i<n; i++) {
		var node = items.item(i);
		var binding = TreeItem(node);
		if (binding.getSelected()) return node;
	}
	return null;
		
},
selectItem: function(item) {

	var listEl = this.getListElement();
	if (item && item.parentNode != listEl) throw "Element doesn't exist in list";
	var items = List(listEl).getItems();
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
	
	var element = this.boundElement;
	var document = element.ownerDocument;
	var event = document.createEvent("Event");
	event.initEvent("change", false, true);
	return element.dispatchEvent(event);

}

});

declareProperties(Tree.prototype, 'listElement selectedIndex selectedItem');


var NavTreeItem = TreeItem.evolve({

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
		var base = document.URL.replace(/#.*$/, '')  + "#";
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

declareProperties(NavTreeItem.prototype, 'view');


var NavTree = Tree.evolve({

getView: NavTreeItem.prototype.getView
	
});

declareProperties(NavTree.prototype, 'view');


var ScrollBox = Box.evolve({
	
setView: function(item) {

	var element = this.boundElement;
	var document = element.ownerDocument;
	if (element.compareDocumentPosition(node) & 0x10) { // Node.DOCUMENT_POSITION_CONTAINED_BY
		throw "setView failed: item is not descendant of ScrollBox";
	}

	element.scrollTop = item.offsetTop - element.offsetTop;

}

});


var ScrollBoxWithResize = Box.evolve({
	
setView: function(item) {

	var element = this.boundElement;
	var document = element.ownerDocument;
	if (element.compareDocumentPosition(node) & 0x10) { // Node.DOCUMENT_POSITION_CONTAINED_BY
		throw "setView failed: item is not descendant of ScrollBoxWithResize";
	}
	element.style.height = "" + item.clientHeight + "px";
	element.scrollTop = item.offsetTop - element.offsetTop;
			
},
domSprocketAttached: function() {
	
	var element = this.boundElement;
	var elementHeight = element.clientHeight;
	element.style.overflow = "hidden";
	element.style.height = "0px";

}

});


var Panel = Box;

var SwitchBox = Box.evolve({

_getPanels: function() {
	return this.boundElement.children;
},
setView: function(item) {
	
	var element = this.boundElement;
	if (item && element != item.parentNode) throw "setView failed: item is not child of SwitchBox";
	var panels = this._getPanels();
	forEach(panels, function(child) {
		var binding = Panel(child);
		if (item == child) binding.setHidden(false);
		else binding.setHidden(true);
	});
			
},
setViewByIndex: function(index) {

	var panels = this._getPanels();
	if (index >= panels.length) throw "setViewByIndex failed: index is not valid for SwitchBox";
	forEach(panels, function(child, i) {
		var binding = Panel(child);
		if (index == i) binding.setHidden(false);
		else binding.setHidden(true);
	});
	return;

},
domSprocketAttached: function() {
	this.setView();
}

});


var Table = Box.evolve({
	
getColumns: function() {
	
	var element = this.boundElement;
	return element.tHead.rows.item(0).cells;
			
},
sort: function(column, type, reverse) {
	

	var element = this.boundElement;
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
	var col = new BaseSprocket(colEl); // TODO classList isn't backwards compat
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
			col = new BaseSprocket(colEl);
			col.removeClass("sorted");
			col.removeClass("reversed");
		}
	}
	
}

});

var WF2FormElement = BaseSprocket.evolve({
encode: function() {

var a = [];
forEach(this.elements, function(el) {
	if (el.name) a.push(el.name + "=" + encodeURIComponent(el.value));
});
var txt = a.join('&');
return txt;
			
}
});


return {
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

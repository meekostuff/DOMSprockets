/*!
 UI components 
 (c) Sean Hogan, 2008,2012,2014
 Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
*/

/* NOTE
	+ Assumes Sprocket.js already loaded
*/

Meeko.sprockets.UI = (function() {

var _ = Meeko.stuff, DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, Base = sprockets.Base, RoleType = sprockets.RoleType;

var Group = sprockets.evolve(RoleType, {

role: 'group'

})

var TreeItem = sprockets.evolve(RoleType, {

role: 'treeitem',

selected: {
	type: 'boolean',
	can: function() { return !this.element.ariaFind('group'); },
	get: function() { return !!this.aria('selected'); },
	set: function(value) { this.aria('selected', value); }
},

expanded: {
	type: 'boolean',
	can: function() { return !!this.element.ariaFind('group'); },
	get: function() { return !!this.aria('expanded'); },
	set: function(value) {
		var group = this.element.ariaFind('group');
		group.ariaToggle('hidden', !value);
		this.aria('expanded', !!value);
	}	
}

});

var Tree = sprockets.evolve(RoleType, {

role: 'tree',

activedescendant: {
	type: 'node',
	get: function() {
		var items = this.element.ariaFindAll('treeitem');
		for (var n=items.length, i=0; i<n; i++) {
			var node = items[i];
			if (node.ariaGet('selected')) return node;
		}
	},
	set: function(node) {
		var oldNode = this.ariaGet('activedescendant');
		if (oldNode) oldNode.ariaToggle('selected', false);
		node.ariaToggle('selected', true); // FIXME check node is treeitem
		this.signalChange();
	}
},

signalChange: function() {
	this.trigger({
		type: 'change'
	});
}

});

var ScrollBox = sprockets.evolve(RoleType, {

role: 'frame',

activedescendant: {
	
	set: function(item) {
		var element = this.element;
		if (element === item || !element.contains(item)) throw "set activedescendant failed: item is not descendant of ScrollBox";
		element.scrollTop = item.offsetTop - element.offsetTop;
	}

}

});


var Panel = RoleType;

var SwitchBox = sprockets.evolve(RoleType, {

role: 'group',

owns: {
	get: function() { return _.toArray(this.element.children); }
},

activedescendant: {
	set: function(item) {
		
		var element = this.element;
		var panels = this.ariaGet('owns');
		if (!_.contains(panels, item)) throw "set activedescendant failed: item is not child of SwitchBox";
		_.forEach(panels, function(child) {
			if (child === item) child.ariaToggle('hidden', false);
			else child.ariaToggle('hidden', true);
		});
	
	}
},

initialize: function() {
	this.setView();
}

});


var Table = sprockets.evolve(RoleType, { // FIXME uses className. This shouldn't be hard-wired
	
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
	Group: Group,
	TreeItem: TreeItem, 
	Tree: Tree, 
	Panel: Panel,
	ScrollBox: ScrollBox, 
	SwitchBox: SwitchBox, 
	Table: Table, 
	WF2FormElement: WF2FormElement	
}

})();

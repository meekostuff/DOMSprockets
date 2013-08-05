DOMSprockets
============

DOMSprockets is a Javascript engine for DOMElement proxies (sprockets)
and behaviors (a sprocket combined with event handlers and status callbacks).

Behaviors are applied to the page declaratively,
by registering them with relevant CSS Selectors.

Sprockets - and, by association, behaviors - are evolvable through prototypal inheritance.
A Base sprocket with generic DOMElement methods is provided in the core library. 
Additionaly, a few fundamental UI sprockets are available in an extra library. 

DOMSprockets is intended to be "as simple as possible, but no simpler".
The core library is less than 5KB minified and gzipped,
and even the combined size of core, legacy, and UI libraries is less than 10KB. 

**WARNING:** This is alpha quality software.
The API is missing essential functions and is quite likely to change.
The code contains bugs so bas they will probably eat you or at least your homework. 
The documentation might be useless, mis-leading, out-of-date or, most likely, non-existant. 


Browser Compatibility
---------------------

DOMSprockets is compatible with most current browsers, including IE9+.
A legacy shim is available for some older browsers, including IE6/7/8.


License
-------

DOMSprockets is available under 
[MPL 2.0](http://www.mozilla.org/MPL/2.0/ "Mozilla Public License version 2.0").
See the [MPL 2.0 FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html "Frequently Asked Questions")
for your obligations if you intend to modify or distribute DOMSprockets or part thereof. 


Installation
------------

Copy or clone the DOMSprockets project files to a directory on your server, say 
	
		/path/to/DOMSprockets/


Quick Start
-----------

Say you want to enable table-sorting on specific tables in a page.
You might use something like the following:


	<script src="/path/to/DOMSprockets/Sprocket.js"></script>
	<script src="/path/to/DOMSprockets/UI.js"></script>	
	<script>
	(function() {
	
	var sprockets = Meeko.sprockets, UI = Meeko.UI;
	sprockets.register('table.sortable', UI.Table, { // apply the `UI.Table` sprocket to any <table class="sortable">
		handlers: [
		{
		  type: 'click', // for click events ...
		  delegator: '> thead > tr > th', // on table.sortable > thead > tr > th ...
		  preventDefault: true, // prevent default actions ...
		  action: function(event, cell) { // and with the event and delegator element (a <th> table-cell) ...
			this.toggleColumnSortState(cell.cellIndex);	// sort the table according to the table-cell's column
		  }
		}
		]
	});
	
	window.onload = function() { // when the page is ready ...
		sprockets.domReady(); // notify the sprockets controller
	}
	
	})();
	</script>


Check the [demos](demos/) for more detailed examples. 


Usage
-----

The DOMSprockets API is available under the `Meeko.sprockets` namespace.

### Sprocket Definitions

Sprockets are managed by the private `SprocketDefinition` class. Instances of this class have the following properties and methods:

- **`prototype`** - the prototype for DOMElement proxies

- **`evolve(prototype)`** - returns a new `SprocketDefinition` instance.
	The `prototype` of the new instance inherits from the caller's `prototype`, and gains the properties and methods of the `prototype` argument.

- **`bind(element)`** - returns a proxy object whose `boundElement` property is a ref to `element`, and
	whose prototype is the `prototype` of the caller.
	
- **`cast(element)`** - if the element matches a registered behavior, and the registration's defined socket inherits from the callers `prototype`,
	then returns the proxy object of the registered behavior.

A sprocket is also a constructor of sorts:

- **`new Sprocket(element)`** calls `.bind(element)` and returns the result

- **`Sprocket(element)`** calls `.cast(element)` and returns the result

### Base Sprocket

Custom `SprocketDefinition`'s are *evolved* from `Meeko.sprockets.Base`, which has the following `prototype`:

- **`$id(id)`**: returns the first descendant element of the `boundElement` with `@id` matching `id`

- **`$(selector)`**: returns the first descendant element of the `boundElement` which matches `selector`

- **`$$(selector)`**: returns the array of descendant elements of the `boundElement` which match `selector`

- **`match$(selector)`**: returns true if the `boundElement` matches `selector`; otherwise returns false

- **`contains(otherNode)`**: returns true if `otherNode` is a **descendant** of the `boundElement`; otherwise returns false

- **`hasClass(token)`**: returns true if the `boundElement` has a class of `token`

- **`addClass(token)`**: adds a class of `token` to `boundElement`, if not already present

- **`removeClass(token)`**: remove all classes of `token` from `boundElement`, if any

- **`toggleClass(token, force)`**:  
	if `force` is boolean `false` then if `removeClass(token)`; otherwise  
	if `force` is boolean `true` then `addClass(token)`;  
	otherwise  
		if `hasClass(token)` is true then `removeClass(token)`; otherwise  
		`addClass(token)`  

- **`trigger(event)`**: simulate dispatching `event` to the `boundElement`,
	calling applicable handlers of any registered behaviors on the element and its ancestors.
	Default actions are not triggered, but the call returns `false` if any handler called `event.preventDefault()`.


### Basic UI Sprockets

`UI.js` adds a few fundamental sprocket definitions under the `Meeko.sprockets.UI` namespace.
These are vaguely modelled on [ARIA roles](http://www.w3.org/TR/wai-aria/roles), and include:

- **Box, ListItem, List, TreeItem, Tree, NavTreeItem, NavTree, Panel, SwitchBox, ScrollBox, Table**

These are intended to be used as base classes for context specific sprockets and behaviors. 
See the source for implementation details.


### Registering Behaviors

Behaviors are registered with:

	Meeko.sprockets.register(selector, sprocket, extras)
	
where:

	- `selector` is a CSS selector, e.g. `table.sortable`
	- `sprocket` is a base or evolved sprocket, e.g. `Meeko.sprockets.UI.Table`
	- `extras` is an object of the form `{ handlers: [], callbacks: {}`, where
		+ handlers is an optional array of `Handler` objects
		+ callbacks is an optional object with status callbacks
		
A **`Handler`** is an object which describes what events are to be handled and how.
It can contain the following filters, directives and methods:

**Filters**: these determine if this handler should process the event
- **`type`** - the event type to handle, e.g. "click", "change"
- **`delegator`** - a relative CSS selector which is used to detected the deepest matching descendant through which the event bubbled through
- **`eventPhase`** - <del>capturing</del> / target / bubbling. See https://developer.mozilla.org/en-US/docs/Web/API/event.eventPhase
- **`button`** - if event type is "click", then it must be this button. See https://developer.mozilla.org/en-US/docs/Web/API/event.button
- **`clickCount`** - if event type is "click", then the event `detail`


**Directives**: these are processed after the handler action is called (if present)
- **`preventDefault`** - prevent the default action of the event
- **`stopPropagation`** - prevent the event from bubbling

**Methods**
- **`action(event, delegator)`** - the action to take. This is called as a method of `sprocket`.
	The `delegator` argument is the element that matches the `delegator` filter.
	If there was no `delegator` filter then this is the `boundElement`. 


### Evolving Sprockets

Start with `Meeko.sprockets.Base` and create a `Hideable` definition

	var Hideable = Meeko.sprockets.Base.evolve({

	setHidden: function(state) {
		var element = this.boundElement;
		if (!state) element.style.display = 'none';
		else element.style.display = '';
	},
	
	getHidden: function() {
		var element = this.boundElement;
		return element.style.display === 'none';
	}

	});

Next create a `MyHideable` definition that inherits from `Hideable`, but overrides `setHidden`, `getHidden` to use CSS classes

	var MyHideable = Hideable.evolve({

	setHidden: function(state) {
		this.toggleClass('hidden', state);
	},
	
	getHidden: function() {
		return this.hasClass('hidden');
	}

	});

Now, if you register `MyHideable` for certain elements

	Meeko.sprockets.register('p.details', MyHideable);
	
but then call `Hideable.cast()` on one such element,
you still get a `MyHideable` sprocket for the element.

	var detailEl = document.querySelector('p.details');
	var detail = Hideable.cast(detailEl);
	detail.setHidden(true);
	console.log(detailEl.className); // logs "details hidden"
	console.log(detailEl.style.display === 'none'); // logs false
	
This is most useful for composite widgets where the sprocket on one element acts as controller
for several other (probably descendant) elements.
For example, a tree might be represented by hierarchical `<ul>/<li>` markup such as:

	<div class="tree">
		<ul>
			<li>1</li>
			<li>2
				<ul>
					<li>2.1</li>
					<li>2.2</li>
				</ul>
			</li>
			<li>3</li>
		</ul>
	</div>
	
Behaviors might be registered like so

	Meeko.sprockets.register('div.tree', UI.Tree, { handlers: [ ... ], callbacks: [ ... ] });
	Meeko.sprockets.register('div.tree li', UI.TreeItem);

In this case `UI.Tree` will control whether `TreeItem`'s are selected or expanded / collapsed. 
But it isn't the responsibility of `UI.Tree` to decide how `TreeItem` should implement being selected or expanded.
So, as long as the registered sprocket inherits from `UI.TreeItem` then UI.Tree will manage.
Even the following - where the evolved `UI.TreeItem` delegates its expanded / collapse feature - is fine. 

	Meeko.sprockets.register('div.tree', UI.Tree, { handlers: [ ... ], callbacks: [ ... ] });
	Meeko.sprockets.register('div.tree li', UI.TreeItem.evolve({
		setExpanded: function(state) {
			var ul = this.$('ul');
			var listBox = UI.List(ul);
			listBox.setHidden(!state);
		},
		getExpanded: function() {
			var ul = this.$('ul');
			var listBox = UI.List(ul);
			return listBox.getHidden();			
		}
	});
	Meeko.sprockets.register('div.tre li > ul', UI.List);


History
-------

This code is derived from the [XBLUI project](http://www.meekostuff.net/projects/XBLUI/) 
which is a (partial) Javascript implementation of the 
[initial XBL 2.0 specification](http://www.w3.org/TR/2007/CR-xbl-20070316/). 

XBL2 was perhaps too ambitious a goal to add to browsers in one hit. It is no longer recommended and anyway, XML is out of favor on the web. 

The DOMSprockets API is an attempt at something more pragmatic; perhaps most appropriate as a base for an ARIA toolkit. 

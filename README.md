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
The core library is under 10KB minified and gzipped. 

**WARNING ! WARNING ! WARNING**

- This is alpha quality software. 
- The API is missing essential functions and is quite likely to change. 
- The code contains bugs so bas they wills prolly eat yer or at least yer's homework. 
- The documentation might be useless, mis-leading, out-of-date or, most likely, non-existant. 


Browser Compatibility
---------------------

DOMSprockets is compatible with most current browsers, including IE9+.


Installation
------------

Copy or clone the DOMSprockets project files to a directory on your server, say 
	`/path/to/DOMSprockets/`


Quick Start
-----------

Say you want to enable table-sorting on specific tables in a page.
You might use something like the following:


	<script src="/path/to/DOMSprockets/Sprocket.js"></script>
	<script src="/path/to/DOMSprockets/ARIA.js"></script>	
	<script>
	(function() {
	
	var sprockets = Meeko.sprockets, UI = Meeko.UI;
	sprockets.registerComponent('ui-table', UI.Table, { // apply the `UI.Table` sprocket to any <table is="ui-table">
		handlers: [
		{
		  type: 'click', // for click events ...
		  delegator: 'thead > tr > th',
		  action: function(event, cell) { // and with the event and delegator element (a <th> table-cell) ...
			this.toggleColumnSortState(cell.cellIndex);	// sort the table according to the table-cell's column
		  }
		}
		]
	});
	
	window.onload = function() { // when the page is ready ...
		sprockets.start(); // notify the sprockets controller
	}
	
	})();
	</script>


Check the [demos](demos/) for more detailed examples. 


Usage
-----

The DOMSprockets API is available under the `Meeko.sprockets` namespace.

### Sprocket Definitions

Sprockets are managed by the private `SprocketDefinition` class. Instances of this class have the following properties and methods:

- **prototype :** the prototype for DOMElement proxies 

A sprocket is also a constructor of sorts:

- **Sprocket(element)** calls `Meeko.sprockets.cast(element, Sprocket)` and returns the result


### Base Sprocket

Custom `SprocketDefinition`'s are *evolved* from `Meeko.sprockets.Base`, which has the following methods:

- **findId(id) :** returns the first descendant element of the `element` with `@id` matching `id`

- **find(selector) :** returns the first descendant element of the `element` which matches `selector`

- **findAll(selector) :** returns the array of descendant elements of the `element` which match `selector`

- **matches(selector) :** returns true if the `element` matches `selector`; otherwise returns false

- **closest(selector) :** traverses upwards in the DOM starting at the `element` and returns the first element which matches `selector`; otherwise returns undefined

- **contains(otherNode) :** returns true if `otherNode` is the `element` or a descendant of the `element`; otherwise returns false

- **hasClass(token) :** returns true if the `element` has a class of `token`

- **addClass(token) :** adds a class of `token` to `element`, if not already present

- **removeClass(token) :** remove all classes of `token` from `element`, if any

- **toggleClass(token, force) :** 
	if `force` is boolean `false` then `removeClass(token)`; otherwise  
	if `force` is boolean `true` then `addClass(token)`;  
	otherwise  
		if `hasClass(token)` is true then `removeClass(token)`; otherwise  
		`addClass(token)`  

- **trigger(type, params) :** dispatch an event of `type` with option `params` to the `element`,
	The call returns `false` if any handler called `event.preventDefault()`.

### ARIA Sprocket

Custom `SprocketDefinition`'s should be *evolved* from `Meeko.sprockets.RoleType`, which inherits from `Meeko.sprockets.Base`
and has the following additional methods:

- **aria(property, value) :** gets or sets the specified aria attribute

- **ariaCan(property) :** indicates if the specified aria property is currently relevant

- **ariaGet(property) :** gets the specified aria property

- **ariaSet(property, value) :** sets the specified aria property

- **ariaToggle(property, state) :** for boolean properties sets or cliears the specified aria property


### Basic UI Sprockets

`ARIA.js` adds a few fundamental sprocket definitions under the `Meeko.sprockets.UI` namespace.
These are vaguely modelled on [ARIA roles](http://www.w3.org/TR/wai-aria/roles), and include:

- **Group, TreeItem, Tree, Panel, SwitchBox, ScrollBox, Table**

These are intended to be used as base classes for context specific sprockets and behaviors. 
See the source for implementation details.


### Registering Behaviors

Behaviors are registered with:

	Meeko.sprockets.registerComponent(tagName, sprocket, extras)
	
where:

- `tagName` is a custom element tag-name, e.g. `ui-table`
- `sprocket` is a base or evolved sprocket, e.g. `Meeko.sprockets.UI.Table`
- `extras` is an optional object of the form `{ handlers: [], callbacks: {}, sprockets: [] }`, where
	+ handlers is an optional array of `Handler` objects
	+ callbacks is an optional object with status callbacks
	+ sprockets is an optional array of scoped sprocket rules of the form `{ matches: '', sprocket: SprocketDefinition }`, where
		* selector is a CSS selector
		* sprocket is a SprocketDefinition
		
A **`Handler`** is an object which describes what events are to be handled and how.
It can contain the following filters, directives and methods:

**Filters**: these determine if this handler should process the event
- **type :** the event type to handle, e.g. "click", "change"
- **delegator :** a relative CSS selector which is used to detected the deepest matching descendant through which the event bubbled through
- **button :** if event type is "click", then it must be this button. See https://developer.mozilla.org/en-US/docs/Web/API/event.button
- **clickCount :** if event type is "click", then the event `detail`

**Methods**
- **action(event, delegator) :** the action to take. This is called as a method of `sprocket`.
	The `delegator` argument is the element that matches the `delegator` filter.
	If there was no `delegator` filter then this is the `element`. 


### Evolving Sprockets

- A definition has methods and ARIA-properties.
- ARIA-properties are only accessible with aria* methods:
	+ `ariaCan(property)`: for `boolean` types *can* it currently be set / cleared?
	+ `ariaGet(property)`: get the current value
	+ `ariaSet(property, value)`: set a new value
	+ `ariaToggle(property, value)`: for `boolean` types set the value to a specific state (or invert it if no value specified)
- ARIA-properties are defined with 
    
	{
		type: 'boolean', // TODO what other types are supported
		can: function() { }, // for `boolean` types
		get: function() { },
		set: function(value) { }
	}

**An Example**

Start with `Meeko.sprockets.ARIA` and create a `Selectable` definition

	var Selectable = Meeko.sprockets.evolve(Meeko.sprockets.ARIA, {

	selected: {
		type: 'boolean',
		
		can: function() {
			return true;
		},
		
		set: function(state) {
			this.element.setAttribute('aria-selected', state ? 'true' : 'false')
		},
		
		get: function() {
			return this.getAttribute('aria-selected') === 'true';
		}
	}
	
	});

Next create a `MySelectable` definition that inherits from `Selectable`, but overrides `selected` to use CSS classes

	var MySelectable = Meeko.sprockets.evolve(Selectable, {

	selected: {
		type: 'boolean',
		
		can: function() {
			return true;
		},
		
		set: function(state) {
			if (state) {
				this.addClass('selected');
			}
			else {
				this.removeClass('selected');
			}
		},
		
		get: function() {
			return this.hasClass('selected');
		}
	}
	
	});

Now, if you register `MySelectable` for certain elements

	Meeko.sprockets.register('li.item', MySelectable);
	
but then call `Selectable.cast()` on one such element,
you still get a `MySelectable` sprocket for the element.

	var item = document.querySelector('li.item');
	var sprocket = sprockets.case(item, Selectable);
	sprocket.ariaToggle('selected', true);
	console.log(item.className); // "item selected"
	console.log(item.getAttribute('aria-selected'); // nothing
	
This is most useful for composite widgets where the sprocket on one element acts as controller
for several other (probably descendant) elements.
For example, a tree might be represented by hierarchical `<ul>/<li>` markup such as:

	<ui-tree>
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
	</ui-tree>
	
Behaviors might be registered like so

	Meeko.sprockets.registerComponent('ui-tree', UI.Tree, {
		handlers: [ ... ], 
		callbacks: { ... }, 
		sprockets: [
			{ matches: 'li', UI.TreeItem },
			{ matches: 'ul', UI.Group }
		]
	});

In this case `UI.Tree` will control whether `TreeItem`'s are selected or expanded / collapsed. 
But it isn't the responsibility of `UI.Tree` to decide how `TreeItem` should implement being selected or expanded.
So, as long as the registered sprocket inherits from `UI.TreeItem` then UI.Tree will manage.
Even the following - where the evolved `UI.TreeItem` delegates its expanded / collapse feature - is fine,
assuming the treeitems are marked up as `<li is="ui-treeitem">`.

	Meeko.sprockets.registerComponent('ui-tree', UI.Tree, {
		handlers: [ ... ],
		callbacks: [ ... ],
		sprockets: [ 
			{ matches: 'li', UI.TreeItem },
			{ matches: 'ul', sprocket: UI.Group }
		]
	});
	Meeko.sprockets.registerComponent('ui-treeitem', MyTreeItem, { ... });


History
-------

This code is derived from the [XBLUI project](http://www.meekostuff.net/projects/XBLUI/) 
which is a (partial) Javascript implementation of the 
[initial XBL 2.0 specification](http://www.w3.org/TR/2007/CR-xbl-20070316/). 

XBL2 was perhaps too ambitious a goal to add to browsers in one hit. It is no longer recommended and anyway, XML is out of favor on the web. 

The DOMSprockets API is an attempt at something more pragmatic; perhaps most appropriate as a base for an ARIA toolkit. 


License
-------

DOMSprockets is available under 
[MPL 2.0](http://www.mozilla.org/MPL/2.0/ "Mozilla Public License version 2.0").
See the [MPL 2.0 FAQ](http://www.mozilla.org/MPL/2.0/FAQ.html "Frequently Asked Questions")
for your obligations if you intend to modify or distribute DOMSprockets or part thereof. 


Contact
-------

If you do find problems, or if you would like to know more, you can contact me at [twitter](https://twitter.com/Meekostuff)
or on [my web-site](http://meekostuff.net).



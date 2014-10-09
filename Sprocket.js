/*!
 Sprocket
 (c) Sean Hogan, 2008,2012,2013,2014
 Mozilla Public License v2.0 (http://mozilla.org/MPL/2.0/)
*/

/* NOTE
Requires some features not implemented on older browsers:
element.matchesSelector (or prefixed equivalent) - IE9+
element.querySelectorAll - IE8+
element.addEventListener - IE9+
*/

/* FIXME
event modifiers aren't filtering
*/

if (!this.Meeko) this.Meeko = {};

(function() {

var window = this;
var document = window.document;

var defaultOptions = {
	"log_level": "warn"
}

var vendorPrefix = 'meeko';

/*
 ### Utility functions
 These might (or might not) be lodash equivalents
 */

if (!Meeko.stuff) Meeko.stuff = (function() {

var uc = function(str) { return str ? str.toUpperCase() : ''; }
var lc = function(str) { return str ? str.toLowerCase() : ''; }

var trim = ''.trim ?
function(str) { return str.trim(); } :
function(str) { return str.replace(/^\s+/, '').replace(/\s+$/, ''); }

var contains = function(a, item) {
	for (var n=a.length, i=0; i<n; i++) if (a[i] === item) return true;
	return false;
}

var toArray = function(coll) { var a = []; for (var n=coll.length, i=0; i<n; i++) a[i] = coll[i]; return a; }

var forEach = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var some = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (fn.call(context, a[i], i, a)) return true; } return false; }

var every = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (!fn.call(context, a[i], i, a)) return false; } return true; }

var map = function(a, fn, context) {
	var output = [];
	for (var n=a.length, i=0; i<n; i++) output[i] = fn.call(context, a[i], i, a);
	return output;
}

var filter = function(a, fn, context) {
	var output = [];
	for (var n=a.length, i=0; i<n; i++) {
		var success = fn.call(context, a[i], i, a);
		if (success) output.push(a[i]);
	}
	return output;
}

var find = function(a, fn, context) {
	for (var n=a.length, i=0; i<n; i++) {
		var item = a[i];
		var success = fn.call(context, item, i, a);
		if (success) return item;
	}
}

var words = function(text) { return text.split(/\s+/); }

var forOwn = function(object, fn, context) {
	var keys = Object.keys(object);
	for (var i=0, n=keys.length; i<n; i++) {
		var key = keys[i];
		fn.call(context, object[key], key, object);
	}
}

var isEmpty = function(o) { // NOTE lodash supports arrays and strings too
	if (o) for (var p in o) if (o.hasOwnProperty(p)) return false;
	return true;
}


var defaults = function(dest, src) {
	var keys = Object.keys(src);
	for (var i=0, n=keys.length; i<n; i++) {
		var key = keys[i];
		if (typeof dest[key] !== 'undefined') continue;
		Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key));
	}
	return dest;
}

var assign = function(dest, src) {
	var keys = Object.keys(src);
	for (var i=0, n=keys.length; i<n; i++) {
		var key = keys[i];
		Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key));
	}
	return dest;
}

var createObject = Object.create;

return {
	uc: uc, lc: lc, trim: trim, words: words, // string
	contains: contains, toArray: toArray, forEach: forEach, some: some, every: every, map: map, filter: filter, find: find, // array
	forOwn: forOwn, isEmpty: isEmpty, defaults: defaults, assign: assign, extend: assign, // object
	create: createObject
}

})();

var _ = _ || Meeko.stuff;

/*
 ### DOM utility functions
 */

if (!Meeko.DOM) Meeko.DOM = (function() {

// WARN getSpecificity is for selectors, **but not** for selector-chains
var getSpecificity = function(selector) { // NOTE this fn is small but extremely naive (and wrongly counts attrs and pseudo-attrs with element-type)
	if (selector.indexOf(',') >= 0) throw "getSpecificity does not support selectors that contain COMMA (,)";		
	var idCount = selector.split('#').length - 1;
	var classCount = selector.split('.').length - 1;
	var typeCount =
		selector.replace(/\*/g, '') // ignore universals
		.replace(/[>+~]/g, ' ') // descendants don't matter
		.replace(/:+|[#.\[\]]/g, ' ') // prepare to count pseudos and id, class, attr
		.split(/\s+/).length - 1 - aCount - bCount; // and remove id and class counts
	
	return [idCount, classCount, typeCount];
}

var cmpSpecificty = function(s1, s2) { // WARN no sanity checks
	var c1 = DOM.getSpecificity(s1), c2 = DOM.getSpecificity(c2);
	for (var n=c1.length, i=0; i<n; i++) {
		var a = c1[i], b = c2[i];
		if (a > b) return 1;
		if (a < b) return -1;
	}
	return 0;
}

// TODO all this node manager stuff assumes that nodes are only released on unload
// This might need revising

var nodeIdProperty = vendorPrefix + 'ID';
var nodeCount = 0; // used to generated node IDs
var nodeTable = []; // list of tagged nodes
var nodeStorage = {}; // hash of storage for nodes, keyed off `nodeIdProperty`

var uniqueId = function(node) {
	var nodeId = node[nodeIdProperty];
	if (nodeId) return nodeId;
	nodeId = '__' + vendorPrefix + '_' + nodeCount++;
	node[nodeIdProperty] = new String(nodeId); // NOTE so that node cloning in IE doesn't copy the node ID property
	nodeTable.push(node);
	return nodeId;
}

var setData = function(node, data) { // FIXME assert node is element
	var nodeId = uniqueId(node);
	nodeStorage[nodeId] = data;
}

var hasData = function(node) {
	var nodeId = node[nodeIdProperty];
	return !nodeId ? false : nodeId in nodeStorage;
}

var getData = function(node, key) { // TODO should this throw if no data?
	var nodeId = node[nodeIdProperty];
	if (!nodeId) return;
	return nodeStorage[nodeId];
}

var releaseNodes = function(callback, context) { // FIXME this is never called
	for (var i=nodeTable.length-1; i>=0; i--) {
		var node = nodeTable[i];
		delete nodeTable[i];
		if (callback) callback.call(context, node);
		var nodeId = node[nodeIdProperty];
		delete nodeStorage[nodeId];
	}
	nodeTable.length = 0;
}


var matchesSelector;
_.some(_.words('moz webkit ms o'), function(prefix) {
	var method = prefix + "MatchesSelector";
	if (document.documentElement[method]) {
		matchesSelector = function(element, selector) { return element[method](selector); }
		return true;
	}
	return false;
});


var matches = matchesSelector ?
function(element, selector, scope) {
	if (scope) selector = absolutizeSelector(selector, scope);
	return matchesSelector(element, selector);
} :
function() { throw "matches not supported"; } // NOTE fallback

var closest = matchesSelector ?
function(element, selector, scope) {
	if (scope) selector = absolutizeSelector(selector, scope);
	for (var el=element; el && el.nodeType === 1 && el!==scope; el=el.parentNode) {
		if (matchesSelector(el, selector)) return el;
	}
	return;
} :
function() { throw "closest not supported"; } // NOTE fallback

function absolutizeSelector(selector, scope) { // WARN does not handle relative selectors that start with sibling selectors
	var id = scope.id;
	if (!id) id = scope.id = uniqueId(scope);
	var scopePrefix = '#' + id + ' ';
	return scopePrefix + selector.replace(/,(?![^(]*\))/g, ', ' + scopePrefix); // COMMA (,) that is not inside BRACKETS. Technically: not followed by a RHB ')' unless first followed by LHB '(' 
}

var $id = function(id, doc) {
	if (!id) return;
	if (!doc) doc = document;
	if (!doc.getElementById) throw 'Context for $id must be a Document node';
	return doc.getElementById(id);
	// WARN would need a work around for broken getElementById in IE <= 7
}

var $$ = document.querySelectorAll ?
function(selector, node, isRelative) {
	if (!node) node = document;
	if (isRelative) selector = absolutizeSelector(selector, node);
	return _.toArray(node.querySelectorAll(selector));
} :
function() { throw "$$ not supported"; };

var $ = document.querySelector ?
function(selector, node, isRelative) {
	if (!node) node = document;
	if (isRelative) selector = absolutizeSelector(selector, node);
	return node.querySelector(selector);
} :
function() { throw "$ not supported"; };

var contains = // WARN `contains()` means contains-or-isSameNode
document.documentElement.contains && function(node, otherNode) {
	if (node === otherNode) return true;
	if (node.contains) return node.contains(otherNode);
	if (node.documentElement) return node.documentElement.contains(otherNode); // FIXME won't be valid on pseudo-docs
	return false;
} ||
document.documentElement.compareDocumentPosition && function(node, otherNode) { return (node === otherNode) || !!(node.compareDocumentPosition(otherNode) & 16); } ||
function(node, otherNode) { throw "contains not supported"; };

var addEventListener =
document.addEventListener && function(node, type, listener, capture) { return node.addEventListener(type, listener, capture); } ||
function(node, type, listener, capture) { throw "addEventListener not supported"; };

var removeEventListener =
document.removeEventListener && function(node, type, listener, capture) { return node.removeEventListener(type, listener, capture); } ||
function(node, type, listener, capture) { throw "removeEventListener not supported"; };

return {
	getSpecificity: getSpecificity, cmpSpecificty: cmpSpecificty,
	uniqueId: uniqueId, setData: setData, getData: getData, hasData: hasData, // FIXME releaseNodes
	$id: $id, $: $, $$: $$, matches: matches, closest: closest,
	contains: contains,
	addEventListener: addEventListener, removeEventListener: removeEventListener
}

})();

var DOM = DOM || Meeko.DOM;

/*
 ### Logger (minimal implementation - can be over-ridden)
 */
if (!Meeko.logger) Meeko.logger = (function() {

var levels = this.levels = _.words("none error warn info debug");

_.forEach(levels, function(name, num) {
	
levels[name] = num;
this[name] = !window.console && function() {} ||
	console[name] && function() { if (num <= this.LOG_LEVEL) console[name].apply(console, arguments); } ||
	function() { if (num <= this.LOG_LEVEL) console.log.apply(console, arguments); }

}, this);

this.LOG_LEVEL = levels[defaultOptions['log_level']]; // DEFAULT

})(); // end logger definition

var logger = logger || Meeko.logger;


this.Meeko.sprockets = (function() {

var sprockets = {};

var activeListeners = {};

var SprocketDefinition = function(prototype) {
	var constructor = function(element) {
		if (this instanceof constructor) return constructor.bind(element);
		return constructor.cast(element);
	}
	constructor.prototype = prototype;
	_.assign(constructor, SprocketDefinition.prototype);
	return constructor;
}

_.assign(SprocketDefinition.prototype, {

bind: function(element) {
	var implementation = _.create(this.prototype);
	implementation.boundElement = element;
	return implementation;
},
cast: function(element) {
	var binding = Binding.getInterface(element);
	if (binding) {
		if (!isPrototypeOf(this.prototype, binding.implementation)) throw "Attached sprocket doesn't match";
		return binding.implementation;
	}
	_.some(sprocketRules, function(rule) {
		var prototype = rule.definition.implementation;
		if (this.prototype !== prototype && !isPrototypeOf(this.prototype, prototype)) return false;
		if (!DOM.matches(element, rule.selector)) return false;
		binding = attachBinding(rule.definition, element);
		return true;
	}, this);
	if (!binding) throw "No compatible sprocket declared";
	return binding.implementation;
},
evolve: function(properties) { // inherit this.prototype, extend with properties
	var prototype = _.create(this.prototype); 
	if (properties) _.assign(prototype, properties);
	var sub = new SprocketDefinition(prototype);
	return sub;
}

});


function attachBinding(definition, element) {
	var binding = new Binding(definition);
	DOM.setData(element, binding);
	binding.attach(element);
	return binding;
}

function detachBinding(definition, element) {
	if (!DOM.hasData(element)) throw 'No binding attached to element';
	var binding = DOM.getData(element);
	if (definition !== binding.definition) throw 'Mismatch between binding and the definition';
	if (binding.inDocument) binding.leftDocumentCallback();
	binding.detach();
	DOM.setData(element, null);
}


var Binding = function(definition) {
	var binding = this;
	binding.definition = definition;
	binding.implementation = _.create(definition.implementation);
	binding.listeners = [];
	binding.inDocument = null; // TODO state assertions in attach/onenter/leftDocumentCallback/detach
}

_.assign(Binding, {

getInterface: function(element) {
	if (DOM.hasData(element)) return DOM.getData(element);
},

enteredDocumentCallback: function(element) {
	var binding = Binding.getInterface(element);
	if (!binding) return;
	binding.enteredDocumentCallback();
},

leftDocumentCallback: function(element) {
	var binding = Binding.getInterface(element);
	if (!binding) return;
	binding.leftDocumentCallback();
}

});

_.assign(Binding.prototype, {

attach: function(element) {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	implementation.boundElement = element;
	_.forEach(definition.handlers, function(handler) {
		var listener = binding.addHandler(handler); // handler might be ignored ...
		if (listener) binding.listeners.push(listener);// ... resulting in an undefined listener
	});
	
	binding.attachedCallback();
},

attachedCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	binding.inDocument = false;
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.attached) callbacks.attached.call(implementation); // FIXME try/catch
	}
},

enteredDocumentCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	binding.inDocument = true;
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.enteredDocument) callbacks.enteredDocument.call(implementation);	
	}	
},

leftDocumentCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	binding.inDocument = false;
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.leftDocument) callbacks.leftDocument.call(implementation);	
	}
},

detach: function() {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	_.forEach(binding.listeners, binding.removeListener, binding);
	binding.listeners.length = 0;
	
	binding.detachedCallback();
},

detachedCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;
	
	binding.inDocument = null;
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.detached) callbacks.detached.call(implementation);	
	}	
},

addHandler: function(handler) {
	var binding = this;
	var implementation = binding.implementation;
	var element = implementation.boundElement;
	var type = handler.type;
	var capture = (handler.eventPhase == 1); // Event.CAPTURING_PHASE
	if (capture) {
		logger.warn('Capturing events not supported');
		return; // FIXME should this convert to bubbling instead??
	}
	var fn = function(event) {
		if (fn.normalize) event = fn.normalize(event);
		return handleEvent.call(implementation, event, handler);
	}
	fn.type = type;
	fn.capture = capture;
	DOM.addEventListener(element, type, fn, capture);
	return fn;
},

removeListener: function(fn) {
	var binding = this;
	var implementation = binding.implementation;
	var element = implementation.boundElement;
	var type = fn.type;
	var capture = fn.capture;
	var target = (element === document.documentElement && _.contains(redirectedWindowEvents, type)) ? window : element; 
	DOM.removeEventListener(target, type, fn, capture);	
},

});

function handleEvent(event, handler) {
	var bindingImplementation = this;
	var target = event.target;
	var current = bindingImplementation.boundElement;
	if (!DOM.hasData(current)) throw "Handler called on non-bound element";
	if (!matchesEvent(handler, event, true)) return; // NOTE the phase check is below
	var delegator = current;
	if (handler.delegator) {
		var el = DOM.closest(target, handler.delegator, current);
		if (!el) return;
		delegator = el;
	}
	switch (handler.eventPhase) { // FIXME DOMSprockets doesn't intend to support eventPhase
	case 1:
		throw "Capturing not supported";
		break;
	case 2:
		if (delegator !== target) return;
		break;
	case 3:
		if (delegator === target) return;
		break;
	default:
		break;
	}

	if (!event._stopPropagation) { // NOTE stopPropagation() prevents custom default-handlers from running. DOMSprockets nullifies it.
		event._stopPropagation = event.stopPropagation;
		event.stopPropagation = function() { logger.warn('event.stopPropagation() is a no-op'); }
	}
	if (!('defaultPrevented' in event)) { // NOTE ensure defaultPrevented works
		event.defaultPrevented = false;
		event._preventDefault = event.preventDefault;
		event.preventDefault = function() { this.defaultPrevented = true; this._preventDefault(); }
	}
	if (handler.action) {
		var result = handler.action.call(bindingImplementation, event, delegator);
		if (result === false) event.preventDefault();
	}
	return;
}


/*
	TODO: better reporting of invalid content
*/

var convertXBLHandler = function(config) {
	var handler = {}
	handler.type = config.event;
	if (null == config.event) logger.warn("Invalid handler: event property undeclared");

	function lookupValue(attrName, lookup) {
		var attrValue = config[attrName];
		var result;
		if (attrValue) {
			result = lookup[attrValue];
			if (null == result) logger.info("Ignoring invalid property " + attrName + ": " + attrValue);
		}
		return result;
	}

	handler.eventPhase = lookupValue("phase", {
		"capture": 1, // Event.CAPTURING_PHASE,
		"target": 2, // Event.AT_TARGET,
		"bubble": 3, // Event.BUBBLING_PHASE,
		"default-action": 0x78626C44 
	}) || 0;

	handler.preventDefault = lookupValue("default-action", {
		"cancel" : true,
		"perform" : false
	}) || false;

	handler.stopPropagation = lookupValue("propagate", {
		"stop": true,
		"continue": false
	}) || false;
	
	function attrText_to_numArray(attr) {				
		var attrText = config[attr];
		if (!attrText) return null;
		var result = [];
		var strings = attrText.split(/\s+/);
		for (var n=strings.length, i=0; i<n; i++) {
			var text = strings[i];
			var num = Number(text);
			if (NaN != num && Math.floor(num) == num) result.push(num);
		}
		return result;
	}

	// Event Filters: mouse / keyboard / text / mutation / modifiers
	
	// mouse
	handler.button = attrText_to_numArray("button");
	handler.clickCount = attrText_to_numArray("click-count");
	
	// keyboard
	handler.key = config.key;
	handler.keyLocation = [];
	var keyLocationText = config["key-location"]
	var keyLocationStrings =  (keyLocationText) ? keyLocationText.split(/\s+/) : [];
	for (var n=keyLocationStrings.length, i=0; i<n; i++) {
		var text = keyLocationStrings[i];
		switch (text) {
			case "standard": handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_STANDARD); break;
			case "left": handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_LEFT); break;
			case "right": handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_RIGHT); break;
			case "numpad": handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_NUMPAD); break;
		}
	}

	// text
	handler.text = config.text;
	
	// non-standard
	handler.filter = new RegExp(config.filter, "");
	
	// mutation
	// FIXME not supported anymore
	handler.attrName = config["attr-name"];
	handler.attrChange = [];
	var attrChangeText = config["attr-change"];
	var attrChangeStrings =  (attrChangeText) ? attrChangeText.split(/\s+/) : [];
	for (var n=attrChangeStrings.length, i=0; i<n; i++) {
		var text = attrChangeStrings[i];
		switch (text) {
			case "modification": handler.attrChange.push(MutationEvent.MODIFICATION); break;
			case "addition": handler.attrChange.push(MutationEvent.ADDITION); break;
			case "removal": handler.attrChange.push(MutationEvent.REMOVAL); break;
		}
	}
	handler.prevValue = config["prev-value"];
	handler.newValue = config["new-value"];
	
	// modifiers
	// TODO should handler.modifiers be {} or []?
	if (null != config["modifiers"]) {
		handler.modifiers = [];
		var modifiersText = config["modifiers"];
		var modifiersStrings = (modifiersText) ? modifiersText.split(/\s+/) : [];
		for (var n=modifiersStrings, i=0; i<n; i++) {
			var text = modifiersStrings[i];
			var m;
			m = /^([+-]?)([a-z]+)(\??)$/.exec(text);
			if (m) {
				var key = m[2];
				var condition = 1; // MUST
				if (m[3]) condition = 0; // OPTIONAL
				else if (m[1] == "+") condition = 1; // MUST
				else if (m[1] == "-") condition = -1; // MUST NOT
				handler.modifiers.push({ key: key, condition: condition });
			}
		}
	}
	else handler.modifiers = null;
	handler.action = config.action;
	
	return handler;
}

var EventModules = {};
EventModules.AllEvents = {};
registerModule('FocusEvents', 'focus blur focusin focusout');
registerModule('MouseEvents', 'click dblclick mousedown mouseup mouseover mouseout mousemove mousewheel');
registerModule('KeyboardEvents', 'keydown keyup');
registerModule('UIEvents', 'load unload abort error select change submit reset resize scroll');

function registerModule(modName, evTypes) {
	var mod = {};
	EventModules[modName] = mod;
	_.forEach(_.words(evTypes), registerEvent, mod);
}
function registerEvent(evType) {
	EventModules.AllEvents[evType] = true;
	this[evType] = true;
}

var matchesEvent = function(handler, event, ignorePhase) {
	// type
	var xblEvents = EventModules.AllEvents;
	var xblMouseEvents = EventModules.MouseEvents;
	var xblKeyboardEvents = EventModules.KeyboardEvents;
	var xblUIEvents = EventModules.UIEvents;

	if (event.type != handler.type) return false;

	// phase
	if (!ignorePhase && !phaseMatchesEvent(handler.eventPhase, event)) return false;
	
	var evType = event.type;

	// MouseEvents
	if (evType in xblMouseEvents) { // FIXME needs testing. Bound to be cross-platform issues still
		if (handler.button && handler.button.length) {
			if (!_.contains(handler.button, event.button) == -1) return false;
		}
		if (handler.clickCount && handler.clickCount.length) { 
			var count = 1;
			// if ("dblclick" == event.type) count = 2;
			if ("click" == event.type) count = (event.detail) ? event.detail : 1;
			if (!_.contains(handler.clickCount, count)) return false;
		}
		if (handler.modifiers) {
			if (!modifiersMatchEvent(handler.modifiers, event)) return false;
		}
	}

	// KeyboardEvents
	// NOTE some of these are non-standard
	var ourKeyIdentifiers = {
		Backspace: "U+0008", Delete: "U+007F", Escape: "U+001B", Space: "U+0020", Tab: "U+0009"
	}

	if (evType in xblKeyboardEvents) {
		if (handler.key) {
			var success = false;
			var keyId = event.keyIdentifier;
			if (/^U\+00....$/.test(keyId)) { // TODO Needed for Safari-2. It would be great if this test could be done elsewhere
				keyId = keyId.replace(/^U\+00/, "U+");
			}
			if (handler.key != keyId && ourKeyIdentifiers[handler.key] != keyId) return false;
		}

		// TODO key-location		
		if (handler.modifiers || handler.key) {
			if (!modifiersMatchEvent(handler.modifiers || [ "none" ], event)) return false;
		}
	}

	// UI events
	if (evType in xblUIEvents) { } // TODO
	
	// user-defined events
	if (!(evType in xblEvents)) { } // TODO should these be optionally allowed / prevented??

	return true;
}

var modifiersMatchEvent = function(modifiers, event) {
	// TODO comprehensive modifiers list
	// event.getModifierState() -> evMods
	// Need to account for any positives
	// Fields are set to -1 when accounted for
	var evMods = {
		control: event.ctrlKey,
		shift: event.shiftKey,
		alt: event.altKey,
		meta: event.metaKey
	};

	var evMods_any = event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
	var evMods_none = !evMods_any;

	var any = false;

	if (modifiers)	{
		for (var i=0, n=modifiers.length; i<n; i++) {
			var modifier = modifiers[i];
			switch (modifier.key) {
				case "none":
					if (evMods_any) return false;
					break;
	
				case "any":
					any = true;
					break;
	
				default:
					var active = evMods[modifier.key];
					switch (modifier.condition) {
						case -1:
							if (active) return false;
							break;
						case 0:
							if (active) evMods[modifier.key] = -1;
							break;
						case 1:
							if (!active) return false;
							evMods[modifier.key] = -1;
							break;
					}				
			}
		}
	}
	
	if (any) return true;
	
	// Fail if any positive modifiers not accounted for
	for (var key in evMods) {
		if (evMods[key] > 0) return false;
	}
	return true;
}

var isPrototypeOf = {}.isPrototypeOf ?
function(prototype, object) { return prototype.isPrototypeOf(object); } :
function(prototype, object) {
	for (var current=object.__proto__; current; current=current.__proto__) if (current === prototype) return true;
	return false;
};

/* CSS Rules */

function BindingDefinition(desc) {
	this.implementation = desc.implementation;
	this.handlers = desc.handlers && desc.handlers.length ? desc.handlers.slice(0) : [];
	this.callbacks = desc.callbacks;
}

function BindingRule(selector, bindingDefn) {
	this.selector = selector;
	this.definition = bindingDefn;
}

_.assign(BindingRule.prototype, {

deregister: function() { // FIXME
	
}

});

var bindingRules = [];
var sprocketRules = [];
var enteringRules = [];
var leavingRules = [];

// FIXME BIG BALL OF MUD
function applyRuleToEnteredElement(rule, element) { // FIXME compare current and new CSS specifities
	var binding = Binding.getInterface(element);
	if (binding && binding.definition !== rule.definition) {
		detachBinding(binding.definition, element); // FIXME logger.warn
		binding = undefined;
	}
	if (!binding) binding = attachBinding(rule.definition, element);
	if (!binding.inDocument) binding.enteredDocumentCallback();
}

function applyRuleToEnteredTree(rule, root) {
	if (!root || root === document) root = document.documentElement;
	if (DOM.matches(root, rule.selector)) applyRuleToEnteredElement(rule, root);
	_.forEach(DOM.$$(rule.selector, root), function(el) { applyRuleToEnteredElement(rule, el); });
}

function applyEnteringRules() {
	var rule; while (rule = enteringRules.shift()) {
		var definition = rule.definition;
		if (definition.handlers && definition.handlers.length || !_.isEmpty(definition.callbacks)) {
			applyRuleToEnteredTree(rule /* , document */);
			bindingRules.unshift(rule); // TODO splice in specificity order
		}
		else sprocketRules.unshift(rule);
	}
}

_.assign(sprockets, {

register: function(selector, sprocket, extras) {
	var alreadyTriggered = (enteringRules.length > 0);
	var bindingDefn = new BindingDefinition({
		implementation: sprocket.prototype,
		handlers: extras && extras.handlers,
		callbacks: extras && extras.callbacks
	});
	var rule = new BindingRule(selector, bindingDefn);
	enteringRules.push(rule);
	if (!alreadyTriggered) setTimeout(applyEnteringRules);
	return rule;
}

});

var started = false;

_.assign(sprockets, {

start: function() { // FIXME find a way to allow progressive binding application
	if (started) throw 'sprockets management has already started';
	started = true;
	observe();
	applyEnteringRules();
},

nodeInserted: function(node) { // NOTE called AFTER node inserted into document
	if (!started) throw 'sprockets management has not started yet';
	if (node.nodeType !== 1) return;
	_.forEach(bindingRules, function(rule) {
		applyRuleToEnteredTree(rule, node);
	});
},

nodeRemoved: function(node) { // NOTE called AFTER node removed document
	if (!started) throw 'sprockets management has not started yet';
	
	Binding.leftDocumentCallback(node);
	_.forEach(DOM.$$('*', node), Binding.leftDocumentCallback);
}

});

var observe = (MutationObserver) ?
function() {
	var observer = new MutationObserver(function(mutations, observer) {
		if (!started) return;
		_.forEach(mutations, function(record) {
			if (record.type !== 'childList') return;
			_.forEach(record.addedNodes, sprockets.nodeInserted, sprockets);
			_.forEach(record.removedNodes, sprockets.nodeRemoved, sprockets);
		});
	});
	observer.observe(document, { childList: true, subtree: true });
	
	// FIXME when to call observer.disconnect() ??
} :
function() { // otherwise assume MutationEvents. TODO is this assumption safe?
	document.addEventListener('DOMNodeInserted', function(e) {
		e.stopPropagation();
		if (!started) return;
		sprockets.nodeInserted(e.target);
	}, true);
	document.body.addEventListener('DOMNodeRemoved', function(e) {
		e.stopPropagation();
		if (!started) return;
		setTimeout(function() { sprockets.nodeRemoved(e.target); }); // FIXME potentially many timeouts. Should use Promises
		// FIXME
	}, true);
};

var basePrototype = {};
sprockets.Base = new SprocketDefinition(basePrototype); // NOTE now we can extend basePrototype

sprockets.trigger = function(target, type, params) { // NOTE every JS initiated event is a custom-event
	if (typeof type === 'object') {
		params = type;
		type = params.type;
	}
	if (typeof type !== 'string') throw 'trigger() called with invalid event type';
	var detail = params && params.detail;
	var event = document.createEvent('CustomEvent');
	event.initCustomEvent(type, true, true, detail);
	if (params) _.defaults(event, params);
	return target.dispatchEvent(event);
}

return sprockets;

})(); // END sprockets

})();

/* Extend BaseSprocket.prototype */
(function() {

var _ = Meeko.stuff;
var DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, basePrototype = sprockets.Base.prototype;


_.assign(basePrototype, {

$: function(selector, isRelative) { return DOM.$(selector, this.boundElement, isRelative); },
$$: function(selector, isRelative) { return DOM.$$(selector, this.boundElement, isRelative); },
matches: function(selector, scope) { return DOM.matches(this.boundElement, selector, scope); },
closest: function(selector, scope) { return DOM.closest(this.boundElement, selector, scope); },

contains: function(otherNode) { return DOM.contains(this.boundElement, otherNode); },

attr: function(name, value) {
	var element = this.boundElement;
	if (typeof value === 'undefined') return element.getAttribute(name);
	element.setAttribute(name, value); // TODO DWIM
},
hasClass: function(token) { // FIXME use @class instead of .className
	return _.contains(_.words(this.boundElement.className), token);
},
addClass: function(token) {
	if (this.hasClass(token)) return this;
	var element = this.boundElement;
	var text = element.className;
	var n = text.length,
		space = (n && text.charAt(n-1) !== " ") ? " " : "";
	text += space + token;
	element.className = text;
	return this;
},
removeClass: function(token) {
	var element = this.boundElement;
	var text = element.className;
	var prev = text.split(/\s+/);
	var next = [];
	_.forEach(prev, function(str) { if (str !== token) next.push(str); });
	if (prev.length == next.length) return this;
	element.className = next.join(" ");
	return this;
},
toggleClass: function(token, force) {
	var found = this.hasClass(token);
	if (found) {
		if (force) return true;
		this.removeClass(token);
		return false;
	}
	else {
		if (force === false) return false;
		this.addClass(token);
		return true;
	}
},

trigger: function() {
	return sprockets.trigger.apply(sprockets, this.boundElement, arguments);
}


});


})(window);

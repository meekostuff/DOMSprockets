/*
 Sprocket
 (c) Sean Hogan, 2008,2012,2013
 All rights reserved.
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

var defaults = { // NOTE defaults also define the type of the associated config option
	"log_level": "warn"
}

var vendorPrefix = 'meeko';

/*
 ### Utility functions
 */

var words = function(text) { return text.split(/\s+/); }

var each = (Object.keys) ? // TODO is this feature detection worth-while?
function(object, fn) {
	var keys = Object.keys(object);
	for (var n=keys.length, i=0; i<n; i++) {
		var key = keys[i];
		fn(key, object[key]);
	}
} : 
function(object, fn) {
	for (slot in object) {
		if (object.hasOwnProperty && object.hasOwnProperty(slot)) fn(slot, object[slot]);
	}
}

var extend = (Object.defineProperty && Object.create) ? // IE8 supports defineProperty but only on DOM objects
function(dest, src) {
       each(src, function(key) { Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key)); });
       return dest;
} :
function(dest, src) {
	each(src, function(key, val) { dest[key] = val; });
	return dest;
};

function indexOf(a, item) {
    for (var n=a.length, i=0; i<n; i++) if (a[i] == item) return i;
    return -1;
}

function some(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (fn.call(context, a[i], i, a)) return true; 
	}
	return false;
}

function forEach(a, fn, context) {
	for (var n=a.length, i=0; i<n; i++) {
		fn.call(context, a[i], i, a);
	}
}

var createObject = Object.create ?
Object.create :
function(prototype) {
	var constructor = function() {};
	constructor.prototype = prototype;
	var object = new constructor;
	if (!object.__proto__) object.__proto__ = prototype;
	return object;
}

var getPrototypeOf = Object.getPrototypeOf ?
Object.getPrototypeOf :
function(object) { return object.__proto__; };

var isPrototypeOf = {}.isPrototypeOf ?
function(prototype, object) { return prototype.isPrototypeOf(object); } :
function(prototype, object) {
	for (var current=object.__proto__; current; current=current.__proto__) if (current === prototype) return true;
	return false;
};


if (!Meeko.stuff) Meeko.stuff = {}
extend(Meeko.stuff, {
	indexOf: indexOf, some: some, forEach: forEach, each: each, extend: extend, words: words
});

/*
 ### DOM utility functions
 */

var DOM = Meeko.DOM || (Meeko.DOM = {});

// WARN getSpecificity is for selectors, **but not** for selector-chains
DOM.getSpecificity = function(selector) { // NOTE this fn is small but extremely naive (and wrongly counts attrs and pseudo-attrs with element-type)
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

DOM.cmpSpecificty = function(s1, s2) { // WARN no sanity checks
	var c1 = DOM.getSpecificity(s1), c2 = DOM.getSpecificity(c2);
	for (var n=c1.length, i=0; i<n; i++) {
		var a = c1[i], b = c2[i];
		if (a > b) return 1;
		if (a < b) return -1;
	}
	return 0;
}

DOM.match$ = function(element, selector) { throw "match$ not supported"; } // NOTE fallback
some(words('moz webkit ms o'), function(prefix) {
	var method = prefix + "MatchesSelector";
	if (document.documentElement[method]) DOM.match$ = function(element, selector) {
		return element[method](selector);
	};
	else return false;
	return true;
});

DOM.$$ = document.querySelectorAll ?
function(selector, node) {
	if (!node) node = document;
	return [].slice.call(node.querySelectorAll(selector), 0);
} :
function(selector, node) { throw "$$ not supported"; };

DOM.$ = document.querySelector ?
function(selector, node) {
	if (!node) node = document;
	return node.querySelector(selector);
} :
function(selector, node) { throw "$ not supported"; };

DOM.$id = function(id, node) { // NOTE assumes node really is a Node in a Document
	var doc;
	if (!node) doc = document;
	else if (node.nodeType === 9) doc = node;
	else doc = node.ownerDocument;
	var result = doc.getElementById(id);
	if (!node || node === doc) return result;
	if (node !== result && DOM.contains(node, result)) return result;
};

DOM.contains = // WARN `contains()` means "contains", not contains-or-isSameNode
document.documentElement.contains && function(node, otherNode) { return node !== otherNode && node.contains(otherNode); } ||
document.documentElement.compareDocumentPosition && function(node, otherNode) { return !!(node.compareDocumentPosition(otherNode) & 16); } ||
function(node, otherNode) { throw "contains not supported"; };

DOM.addEventListener =
document.addEventListener && function(node, type, listener, capture) { return node.addEventListener(type, listener, capture); } ||
function(node, type, listener, capture) { throw "addEventListener not supported"; };

DOM.removeEventListener =
document.removeEventListener && function(node, type, listener, capture) { return node.removeEventListener(type, listener, capture); } ||
function(node, type, listener, capture) { throw "removeEventListener not supported"; };

var logger = Meeko.logger || (Meeko.logger = new function() {

var levels = this.levels = words("none error warn info debug");

forEach(levels, function(name, num) {
	
levels[name] = num;
this[name] = !window.console && function() {} ||
	console[name] && function() { if (num <= this.LOG_LEVEL) console[name].apply(console, arguments); } ||
	function() { if (num <= this.LOG_LEVEL) console.log.apply(console, arguments); }

}, this);

this.LOG_LEVEL = levels[defaults['log_level']]; // DEFAULT

}); // end logger defn


this.Meeko.sprockets = (function() {

var sprockets = {};

// TODO all this node manager stuff assumes that nodes are only released on unload
// This might need revising

var nodeIdProperty = vendorPrefix + 'ID';
var nodeCount = 0; // used to generated node IDs
var nodeTable = []; // list of nodes being managed
var nodeStorage = {}; // hash of storage for nodes, keyed off `nodeIdProperty`

var nodeManager = {

setData: function(node, data) { // FIXME assert node is element
	var nodeId = node[nodeIdProperty];
	if (!nodeId) {
		nodeId = '__' + vendorPrefix + '_' + nodeCount++;
		node[nodeIdProperty] = new String(nodeId); // NOTE so that node cloning in IE doesn't copy the node ID property
		nodeTable.push(node);
	}
	nodeStorage[nodeId] = data;
},
hasData: function(node) {
	var nodeId = node[nodeIdProperty];
	return !nodeId ? false : nodeId in nodeStorage;
},
getData: function(node, key) {
	var nodeId = node[nodeIdProperty];
	if (!nodeId) return;
	return nodeStorage[nodeId];
},
releaseNodes: function(callback, context) {
	for (var i=nodeTable.length-1; i>=0; i--) {
		var node = nodeTable[i];
		delete nodeTable[i];
		if (callback) callback.call(context, node);
		var nodeId = node[nodeIdProperty];
		delete nodeStorage[nodeId];
	}
	nodeTable.length = 0;
}

}


var activeListeners = {};

var SprocketDefinition = function(prototype) {
	var constructor = function(element) {
		if (this instanceof constructor) return constructor.bind(element);
		return constructor.cast(element);
	}
	constructor.prototype = prototype;
	extend(constructor, SprocketDefinition.prototype);
	return constructor;
}

extend(SprocketDefinition.prototype, {

bind: function(element) {
	var implementation = createObject(this.prototype);
	implementation.boundElement = element;
	return implementation;
},
cast: function(element) {
	var binding = Binding.getInterface(element);
	if (binding) {
		if (!isPrototypeOf(this.prototype, binding.implementation)) throw "Attached sprocket doesn't match";
		return binding.implementation;
	}
	var implementation;
	some(sprocketRules, function(rule) {
		var prototype = rule.definition.implementation;
		if (this.prototype !== prototype && !isPrototypeOf(this.prototype, prototype)) return false;
		if (!DOM.match$(element, rule.selector)) return false;
		implementation = createObject(prototype);
		implementation.boundElement = element;
		return true;
	}, this);
	if (!implementation) throw "No compatible sprocket declared";
	return implementation;
},
evolve: function(properties) { // inherit this.prototype, extend with prototype and copy this.handlers and handlers
	var prototype = createObject(this.prototype); 
	if (properties) extend(prototype, properties);
	var sub = new SprocketDefinition(prototype);
	return sub;
}

});


var redirectedWindowEvents = words('scroll resize'); // FIXME would be nice not to have this hack
startStopTimeout = 500; // FIXME Config option
var startStop = words('scroll resize');
var startStopEvents = {};
forEach(startStop, function(orgType) {
	startStopEvents[orgType + 'start'] = { origin: orgType };
	startStopEvents[orgType + 'stop'] = { origin: orgType };
});

var Binding = function(definition) {
	this.definition = definition;
}

extend(Binding.prototype, {

attach: function(element) {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation = createObject(definition.implementation);
	implementation.boundElement = element;
	binding.listeners = []; // FIXME should be in binding constructor??
	forEach(definition.handlers, function(handler) {
		var listener = binding.addHandler(handler);
		binding.listeners.push(listener);
	});
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.attached) callbacks.attached.call(implementation);
		if (callbacks.enteredDocument) callbacks.enteredDocument.call(implementation);	
	}	
},

detach: function(element) {
	var binding = this;
	var definition = binding.definition;
	forEach(binding.listeners, binding.removeListener, binding);
	binding.listeners.length = 0;
	var callbacks = definition.callbacks;
	if (callbacks) {
		if (callbacks.leftDocument) callbacks.leftDocument.call(implementation);	
		if (callbacks.detached) callbacks.detached.call(implementation);	
	}	
},

addHandler: function(handler) {
	var binding = this;
	var implementation = binding.implementation;
	var element = implementation.boundElement;
	var type = handler.type;
	var capture = (handler.eventPhase == 1); // Event.CAPTURING_PHASE
	var fn = function(event) {
		if (fn.normalize) event = fn.normalize(event);
		return handleEvent.call(implementation, event, handler);
	}
	fn.type = type;
	fn.capture = capture;
	var target = (element === document.documentElement && indexOf(redirectedWindowEvents, type) >= 0) ? window : element;
	
	var sim = startStopEvents[type];
	if (sim) {
		if (!binding[sim.origin]) (function(element, type) {
			var binding = this;
			binding[type] = true;
			var target = (element === document.documentElement && indexOf(redirectedWindowEvents, type) >= 0) ? window : element;
			var timerName = type + 'Timeout';
			function listener(event) {
				if (!binding[timerName]) binding.triggerHandlers({ type: type + 'start' });
				else window.clearTimeout(binding[timerName]);
				binding[timerName] = window.setTimeout(callback, startStopTimeout);
			}
			function callback() {
				delete binding[timerName];
				binding.triggerHandlers({ type: type + 'stop' });
			}
			DOM.addEventListener(target, type, listener, false);
		}).call(binding, target, sim.origin);
	}
	else DOM.addEventListener(target, type, fn, capture);
	return fn;
},

removeListener: function(fn) { // FIXME doesn't handle simulated start/stop events 
	var binding = this;
	var implementation = binding.implementation;
	var element = implementation.boundElement;
	var type = fn.type;
	var capture = fn.capture;
	var target = (element === document.documentElement && indexOf(redirectedWindowEvents, type) >= 0) ? window : element; 
	DOM.removeEventListener(target, type, fn, capture);	
},

triggerHandlers: function(event) {
	var binding = this;
	if (!binding || !binding.listeners) return;
	forEach(binding.listeners, function(handler) {
		if (handler.type !== event.type) return;
		handler(event); // FIXME isolate
	});
}

});


function attachBinding(definition, element) {
	var binding = new Binding(definition);
	nodeManager.setData(element, binding);
	binding.attach(element);
	return binding;
}

function detachBinding(definition, element) { // FIXME
	var binding = nodeManager.getData(element);
	if (!binding) throw 'No binding attached to element';
	var implementation = binding.implementation;
	if (!isPrototypeOf(definition.implementation, implementation)) throw 'Mismatch between binding and the definition';
	binding.detach(element);
	nodeManager.setData(element, null);
	return null;
}

extend(Binding, {

getInterface: function(element) {
	if (nodeManager.hasData(element)) return nodeManager.getData(element);
}

});

function handleEvent(event, handler) {
	var bindingImplementation = this;
	var target = event.target;
	var current = bindingImplementation.boundElement;
	var nodeId = current[nodeIdProperty];
	if (!nodeId) throw "Handler called on non-bound element";
	if (!matchesEvent(handler, event, true)) return; // NOTE the phase check is below
	var delegator = current;
	if (handler.delegator) {
		var delegators = handler.delegator.split(',');
		if (!current.id) current.id = nodeId;
		var scope = '#' + current.id + ' ';
		var delegatorSelector = scope + delegators.join(', ' + scope);
		for (var el=target; el!=current; el=el.parentNode) {
			if (DOM.match$(el, delegatorSelector)) break;
		}
		if (el == current) return;
		delegator = el;
	}
	switch (handler.eventPhase) {
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

	if (handler.stopPropagation) { // FIXME
		if (event.stopPropagation) event.stopPropagation();
		else event.cancelBubble = true;
	}
	if (handler.preventDefault) { // FIXME
		if (event.preventDefault) event.preventDefault();
		else event.returnValue = false;
	}
	if (handler.action) {
		var result = handler.action.call(bindingImplementation, event, delegator);
		if (result === false) event.preventDefault();
	}
	return;
}

function dispatchEvent(target, event) {
	event.defaultPrevented = false;
	event.preventDefault = function() { this.defaultPrevented = true; }
	event.propagationStopped = true;
	event.stopPropagation = function() { this.propagationStopped = true; }
	event.target = target;
	event.eventPhase = 2;
	for (var current=target; current!=document; current=current.parentNode) {
		event.currentTarget = current;
		event.eventPhase = (current === target) ? 2 : 3;
		var binding = Binding.getInterface(current);
		if (binding) binding.triggerHandlers(event);
/*		
		if (!binding || !binding.listeners) continue;
		forEach(binding.listeners, function(handler) {
			if (handler.type !== event.type) return;
			handler(event); // FIXME isolate
		});
*/
		if (event.propagationStopped) break; 
	}
	return !event.defaultPrevented;	
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
	forEach(words(evTypes), registerEvent, mod);
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
			if (handler.button.indexOf(event.button) == -1) return false;
		}
		if (handler.clickCount && handler.clickCount.length) { 
			var count = 1;
			// if ("dblclick" == event.type) count = 2;
			if ("click" == event.type) count = (event.detail) ? event.detail : 1;
			if (handler.clickCount.indexOf(count) == -1) return false;
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

extend(BindingRule.prototype, {

deregister: function() { // FIXME
	
}

});

var bindingRules = [];
var sprocketRules = [];
var enteringRules = [];
var leavingRules = [];

// FIXME BIG BALL OF MUD
function applyRuleToElement(rule, element) { // FIXME compare current and new CSS specifities
	var binding = Binding.getInterface(element);
	if (binding) detachBinding(binding.definition, element);
	attachBinding(rule.definition, element);
}

function applyRuleToTree(rule, root) {
	if (!root || root === document) root = document.documentElement;
	if (DOM.match$(root, rule.selector)) applyRuleToElement(rule, root);
	forEach(DOM.$$(rule.selector, root), function(el) { applyRuleToElement(rule, el); });
}

function applyEnteringRules() {
	var rule; while (rule = enteringRules.shift()) {
		var defn = rule.definition;
		if (defn.handlers && defn.handlers.length || !isEmptyObject(defn.callbacks)) {
			applyRuleToTree(rule /* , document */);
			bindingRules.unshift(rule); // TODO splice in specificity order
		}
		else sprocketRules.unshift(rule);
	}
}

function isEmptyObject(o) {
	if (o) for (var p in o) if (o.hasOwnProperty(p)) return false;
	return true;
}

extend(sprockets, {

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

extend(sprockets, {

domReady: function() { // FIXME find a way to allow progressive binding application
	if (started) throw 'domReady() has already been called';
	started = true;
	applyEnteringRules();
},

refresh: function(node) { // NOTE called AFTER node inserted into document
	if (!node) node = document;
	if (!started) throw 'domReady() has not been called yet';
	forEach(cssRules, function(rule) {
		applySprocketToTree(rule.specification, rule.selector, node);
	});
}

});

var basePrototype = {};
sprockets.Base = new SprocketDefinition(basePrototype); // NOTE now we can extend basePrototype

sprockets.trigger = dispatchEvent;
return sprockets;

})(); // END sprockets

})();

/* Extend BaseSprocket.prototype */
(function() {

var _ = Meeko.stuff, extend = _.extend, forEach = _.forEach, words = _.words, indexOf = _.indexOf;
var DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, basePrototype = sprockets.Base.prototype;


extend(basePrototype, {

$: function(selector) { return DOM.$(selector, this.boundElement); },
$id: function(id) { return DOM.$id(selector, this.boundElement); },
$$: function(selector) { return DOM.$$(selector, this.boundElement); },
match$: function(selector) { return DOM.match$(this.boundElement, selector); },

contains: function(otherNode) { return DOM.contains(this.boundElement, otherNode); },

hasClass: function(token) {
	return indexOf(words(this.boundElement.className), token) >= 0;
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
	forEach(prev, function(str) { if (str !== token) next.push(str); });
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

trigger: function(event) {
	return sprockets.trigger(this.boundElement, event);
}


});


})();
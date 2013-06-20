/*
 Binding
 (c) Sean Hogan, 2008,2012,2013
 All rights reserved.
*/

/* NOTE
Requires some features not implemented on older browsers:
element.matchesSelector (or prefixed equivalent) - IE9+
element.querySelectorAll - IE8+
*/

if (!this.Meeko) this.Meeko = {};

(function() {

var defaults = { // NOTE defaults also define the type of the associated config option
	"log_level": "warn"
}

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

var extend = (Object.defineProperty) ?
function(dest, src) {
	each(src, function(key) { Object.defineProperty(dest, key, Object.getOwnPropertyDescriptor(src, key)); });
	return dest;
} :
function(dest, src) {
	each(src, function(key, val) { dest[key] = val; });
	return dest;
}

var some = function(a, fn, context) { 
	for (var n=a.length, i=0; i<n; i++) {
		if (fn.call(context, a[i], i, a)) return true; 
	}
	return false;
}

var forEach = function(a, fn, context) {
	for (var n=a.length, i=0; i<n; i++) {
		fn.call(context, a[i], i, a);
	}
}

if (!Meeko.stuff) Meeko.stuff = {}
extend(Meeko.stuff, {
	forEach: forEach, each: each, extend: extend
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
	if (document.body[method]) DOM.match$ = function(element, selector) {
		if (selector.indexOf(',') >= 0) throw "match$ does not support selectors that contain COMMA (,)";		
		return element[method](selector);
	};
	else return false;
	return true;
});

DOM.$$ = document.querySelectorAll ?
function(selector, node) {
	if (selector.indexOf(',') >= 0) throw "$$ does not support selectors that contain COMMA (,)";
	if (!node) node = document;
	return [].slice.call(node.querySelectorAll(selector), 0);
} :
function(selector, node) { throw "$$ not supported"; };

DOM.$ = document.querySelector ?
function(selector, node) {
	if (!node) node = document;
	if (selector.indexOf(',') >= 0) throw "$ does not support selectors that contain COMMA (,)";
	return node.querySelector(selector);
} :
function(selector, node) { throw "$ not supported"; };

DOM.$id = function(id, node) { // NOTE assumes node really is a Node in a Document
	var doc;
	if (!node) doc = document;
	else if (node.nodeType === 9) doc = node;
	else doc = node.ownerDocument;
	var result = doc.getElementById(id);
	if (!node || node == doc) return result;
	if (DOM.contains(node, result)) return result;
};

DOM.contains =
document.body.contains && function(node, otherNode) { return node !== otherNode && node.contains(otherNode); } ||
document.body.compareDocumentPosition && function(node, otherNode) { return !!(node.compareDocumentPosition(otherNode) & 16); } ||
function(node, otherNode) { throw "contains not supported"; };

DOM.addEventListener = document.addEventListener ?
function(node, type, listener, capture) { return node.addEventListener(type, listener, capture); } :
function(node, type, listener, capture) { throw "addEventListener not supported"; };

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


this.Meeko.xbl = (function() {

var xbl = {};

var activeListeners = {};

var Binding = function() {
	if (!(this instanceof Binding)) return new Binding();
	this.prototype = {};
	this.handlers = [];
}

extend(Binding.prototype, {
getBindingFor: function(element) {
	return ElementXBL.getInterface(element, true).getBinding(this, true);
},
evolve: function(properties, handlers) { // inherit this.prototype, extend with prototype and copy this.handlers and handlers
	var sub = new Binding();
	var prototype = Object.create(this.prototype); // FIXME Object.create for older browsers
	if (properties) extend(prototype, properties);
	sub.prototype = prototype;
	[].push.apply(sub.handlers, this.handlers);
	if (handlers) [].push.apply(sub.handlers, handlers); // FIXME assert handlers is array
	return sub;
}

});

var ElementXBL = function(element) {
	this.xblImplementations = []; // TODO max of one binding per element so don't need array
	this.boundElement = element;
}
extend(ElementXBL.prototype, {
	
addBinding: function(spec) {
	if (this.xblImplementations.length >= 1) throw "Maximum of one binding per element"; // FIXME DOMError
	var binding = Object.create(spec.prototype);
	binding.specification = spec;
	binding.boundElement = this.boundElement;
	this.xblImplementations.push(binding);
	if (binding.xblBindingAttached) binding.xblBindingAttached();
	if (binding.xblEnteredDocument) binding.xblEnteredDocument();
},

removeBinding: function(spec) {
	var list = this.xblImplementations;
	for (var binding, i=list.length-1; binding=list[i]; i--) {
		if (binding.constructor != spec) continue;
		if (binding.xblLeftDocument) binding.xblLeftDocument();
		list.splice(i, 1);
		break;
	}
},

getBinding: function(spec, derived) {
	var list = this.xblImplementations;
	for (var binding, i=list.length-1; binding=list[i]; i--) {
		if (Object.getPrototypeOf(binding) == spec.prototype || derived && spec.prototype.isPrototypeOf(binding)) return binding;
	}
	return null;
}

});
extend(ElementXBL, {
getInterface: function(element, bCreate) {
	if (element._elementXBL) return element._elementXBL;
	if (!bCreate) return null;
	element._elementXBL = new ElementXBL(element);
	return element._elementXBL;
}
});

/*
 handleEvent() is designed to be attached as a listener on document.
 For each element on the event-path (between document and event target)
 it determines if there are valid handlers,
 and if so it adds an appropriate listener. 
*/

function handleEvent(event) {
	var listeners = activeListeners[event.type];
	if (listeners && listeners.length > 0) {
		forEach(listeners, function(listener) {
			listener.node.removeEventListener(event.type, listener.fn, false);
		});
	}
	listeners = activeListeners[event.type] = [];
	
	var target = event.target;
	for (var current=target; current!=document; current=current.parentNode) { // TODO detect matching but unapplied bindings
		var elementXBL = ElementXBL.getInterface(current);
		if (!elementXBL) continue;
		var bindings = elementXBL.xblImplementations;
		if (!bindings || bindings.length <= 0) continue;
		forEach(bindings, function(binding) { // there should be a maximum of one, but this creates a closure
			forEach(binding.specification.handlers, function(handler) {
				if (!matchesEvent(handler, event, true)) return; // NOTE the phase check is below
				var delegator = current;
				var fn = function(e) {
					if (handler.stopPropagation) e.stopPropagation();
					if (handler.preventDefault) e.preventDefault();
					if (handler.action) handler.action.call(binding, e, delegator);
				}
				
				if (handler.delegator) {
					var delegatorSelector = current.id + ' ' + handler.delegator; // FIXME doesn't assert current.id or that handler.delegator isn't a chain
					for (var el=target; el!=current; el=el.parentNode) {
						if (DOM.match$(el, delegatorSelector)) break;
					}
					if (el == current) return;
					delegator = el;
				}
				if (delegator == target) {
					if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.AT_TARGET }))
						listeners.push({ node: current, fn: fn });
				}
				else {
					if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.CAPTURING_PHASE }))
						throw "Capturing not supported";
					else if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.BUBBLING_PHASE }))
						listeners.push({ node: current, fn: fn });
				}
			});
		});
	}
	
	forEach(listeners, function(listener) {
		DOM.addEventListener(listener.node, event.type, listener.fn, false); // NOTE only ever bubbling-phase
	});
	
	return;
}

/*
	XBL document & element wrappers
	TODO: better reporting of invalid content
	TODO: clean up the process of adding xblDocument property to XBLBindingElements
	TODO: tight binding of wrappers?? Won't work in IE
*/

var convertXBLHandler = function(config) {
	var handler = {}
	// Otherwise assume xbl names
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

var matchesEvent = function(handler, event, ignorePhase) {
	// type
	var xblEvents = { click: true, dblclick: true, mousedown: true, mouseup: true, mouseover: true, mouseout: true, mousemove: true,
		keydown: true, keyup: true, textInput: true, 
		load: true, unload: true, abort: true, error: true, select: true, change: true, submit: true, reset: true, resize: true, scroll: true };
	var xblMouseEvents = { click: true, dblclick: true, mousedown: true, mouseup: true, mouseover: true, mouseout: true, mousemove: true, mousewheel: true };
	var xblKeyboardEvents = { keydown: true, keyup: true };
	var xblTextEvents = { textInput: true };
	var xblHTMLEvents = { load: true, unload: true, abort: true, error: true, select: true, change: true, submit: true, reset: true, resize: true, scroll: true };

	if (event.type != handler.type) return false;

	// phase
	if (!ignorePhase && !phaseMatchesEvent(handler.phase, event)) return false;
	
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
			if (/^U\+00....$/.test(keyId)) { // TODO Needed for Safari-2. It would be great if this test could be done in eventSystem
				keyId = keyId.replace(/^U\+00/, "U+");
			}
			if (handler.key != keyId && ourKeyIdentifiers[handler.key] != keyId) return false;
		}

		// TODO key-location		
		if (handler.modifiers || handler.key) {
			if (!modifiersMatchEvent(handler.modifiers || [ "none" ], event)) return false;
		}
	}

	// TextEvents
	if (evType in xblTextEvents) {
		if (handler.text && handler.text != event.data) return false;
	}
		
	// HTML events
	if (evType in xblHTMLEvents) { }
	
	// user-defined events.  TODO should these be optionally allowed / prevented??
	if (!(evType in xblEvents)) { }

	return true;
}

var phaseMatchesEvent = function(phase, event) {
	var evPhase = event.eventPhase;
	if (phase && evPhase != phase) return false;
	else { // no specified phase means target or bubbling okay
		if (Event.BUBBLING_PHASE != evPhase && Event.AT_TARGET != evPhase) return false;
	}
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
var cssBindingRules = [];
var enteringBindingRules = [];
var leavingBindingRules = [];

// FIXME BIG BALL OF MUD
function applyBindingToElement(spec, element) { // FIXME compare current and new CSS specifities
	var elementXBL = ElementXBL.getInterface(element, true);
	var firstBinding;
	while (firstBinding = elementXBL.xblImplementations[0]) elementXBL.removeBinding(firstBinding);
	elementXBL.addBinding(spec);
}

function applyBindingToTree(spec, selector, root) {
	if (!root) root = document.documentElement;
	if (DOM.match$(root, selector)) applyBindingToElement(spec, root);
	forEach(DOM.$$(selector, root), function(el) { applyBindingToElement(spec, el); });
}

function applyEnteringBindingRules() {
	var rule; while (rule = enteringBindingRules.shift()) {
		forEach(rule.specification.handlers, function(handler) {
			var type = handler.type
			if (!activeListeners[type]) {
				activeListeners[type] = [];
				DOM.addEventListener(document, type, handleEvent, true);
			}
		});
		applyBindingToTree(rule.specification, rule.selector /* , document */);
		cssBindingRules.unshift(rule); // TODO splice in specificity order
	}
}

var CSS = xbl.CSS = {}

extend(CSS, {

addBinding: function(selector, spec) {
	var alreadyTriggered = (enteringBindingRules.length > 0);
	enteringBindingRules.push({ specification: spec, selector: selector });
	if (!alreadyTriggered) setTimeout(applyEnteringBindingRules);
},
removeBinding: function(selector, spec) { // TODO
	
}

});

var started = false;

extend(xbl, {

domReady: function() { // FIXME find a way to allow progressive binding application
	if (started) throw 'domReady() has already been called';
	started = true;
	applyEnteringBindingRules();
},

nodeInserted: function(node) { // NOTE called AFTER node inserted into document
	if (!started) throw 'domReady() has not been called yet';
	forEach(cssBindingRules, function(rule) {
		applyBindingToTree(rule.specification, rule.selector, node);
	});
},
nodeRemoved: function(node) { // NOTE called BEFORE node removed from document
	if (!started) throw 'domReady() has not been called yet';
}

});

xbl.Binding = Binding;
xbl.baseBinding = new Binding(); // NOTE now we can extend baseBinding.prototype

return xbl;

})(); // END xbl

})();

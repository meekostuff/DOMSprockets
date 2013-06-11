/*
 Binding
 (c) Sean Hogan, 2008,2012
 All rights reserved.
*/

/* NOTE
Requires some features not implemented on older browsers:
[].forEach - IE9+
element.matchesSelector (or prefixed equivalent) - IE9+
element.querySelector* - IE8+
*/

if (!this.Meeko) this.Meeko = {};

(function() {
	
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

var forEach = function(array, fn) { return [].forEach.call(array, fn); } 

if (!Meeko.stuff) Meeko.stuff = {}
extend(Meeko.stuff, {
	forEach: forEach, each: each, extend: extend
});

var	$id = function(id, doc) { if (!doc) doc = document; return doc.getElementById(id); }
var $ = function(selector, context) { if (!context) context = document; return context.querySelector(selector); }
var $$ = function(selector, context) { if (!context) context = document; return [].slice.call(context.querySelectorAll(selector), 0); }

if (!Meeko.DOM) Meeko.DOM = {}
extend(Meeko.DOM, {
	$id: $id, $: $, $$: $$
});

if (!Meeko.logger) Meeko.logger = new function() {

var levels = words("NONE ERROR WARN INFO DEBUG");

forEach(levels, function(name, num) {
	
this["LOG_"+name] = num;
this[lc(name)] = function() { this._log({ level: num, message: arguments }); }

}, this);

this._log = function(data) { 
	if (data.level > this.LOG_LEVEL) return;
	data.timeStamp = +(new Date);
        data.message = [].join.call(data.message, " ");
        if (this.write) this.write(data);
}

this.startTime = +(new Date), padding = "      ";

this.write = (window.console) && function(data) { 
	var offset = padding + (data.timeStamp - this.startTime), 
		first = offset.length-padding.length-1,
		offset = offset.substring(first);
	console.log(offset+"ms " + levels[data.level]+": " + data.message); 
}

this.LOG_LEVEL = this.LOG_WARN; // DEFAULT

} // end logger defn

})();

this.Meeko.xbl = (function() {

var _ = Meeko.stuff, extend = _.extend, forEach = _.forEach;
var DOM = Meeko.DOM, $id = DOM.$id, $ = DOM.$, $$ = DOM.$$;
var logger = Meeko.logger;

var xbl = {}

var activeListeners = {}

var Binding = function() {
	if (!(this instanceof Binding)) return new Binding();
	this.prototype = null;
	this.handlers = [];
}

Binding.create = function(prototype, handlers) {
	var binding = new Binding();
	binding.setImplementation(prototype || {});
	if (handlers) handlers.forEach(function(handler) { binding.addHandler(handler); });
	return binding;
}

extend(Binding.prototype, {
setImplementation: function(prototype) {
	if (this.prototype) throw "Implementation already set";
	this.prototype = prototype;
},
addHandler: function(handler) {
	this.handlers.push(handler);
	var type = handler.type
	if (!activeListeners[type]) {
		activeListeners[type] = [];
		document.addEventListener(type, handleEvent, true);
	}
},
removeHandler: function(handler) {
	this.handlers.splice(handlers.indexOf(handler), 1);
},
getBindingFor: function(element) {
	return Element.getBinding(element, this, true);
},
create: function(properties, handlers) { // inherit this.prototype, extend with prototype and copy this.handlers and handlers
	var sub = new Binding();
	var prototype = Object.create(this.prototype);
	if (properties) extend(prototype, properties);
	sub.setImplementation(prototype);
	this.handlers.forEach(function(handler) { sub.addHandler(handler); });
	if (handlers) handlers.forEach(function(handler) { sub.addHandler(handler); });
	return sub;
}

});

extend(Binding, {
SYSTEM_CONTEXT: 0,
CONFIGURATION_CONTEXT: 1,
CSS_CONTEXT: 2,
IMMEDIATE_CONTEXT: 3
});

var ElementXBL = function(element) {
	this.xblImplementations = [];
	this.boundElement = element;
}
extend(ElementXBL.prototype, {
	
addBinding: function(spec) {
	if (this.xblImplementations.length >= 1) throw "Maximum of one binding per element";
	var binding = Object.create(spec.prototype);
	binding.specification = spec;
	binding.context = Binding.IMMEDIATE_CONTEXT;
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

var Element = xbl.Element = {}
extend(Element, {
	
addBinding: function(element, spec) {
	return ElementXBL.getInterface(element, true).addBinding(spec);
},
removeBinding: function(element, spec) {
	return ElementXBL.getInterface(element, true).removeBinding(spec);
},
getBinding: function(element, spec, derived) {
	return ElementXBL.getInterface(element, true).getBinding(spec, derived);
}

});

var body = document.body;
if (body.mozMatchesSelector) Element.matchesSelector = function(element, selector) { return element.mozMatchesSelector(selector); }
if (body.webkitMatchesSelector) Element.matchesSelector = function(element, selector) { return element.webkitMatchesSelector(selector); }
if (body.msMatchesSelector) Element.matchesSelector = function(element, selector) { return element.msMatchesSelector(selector); }
if (body.oMatchesSelector) Element.matchesSelector = function(element, selector) { return element.oMatchesSelector(selector); }

/*
 handleEvent() is designed to be attached as a listener on document.
 For each element on the event-path (between document and event target)
 it determines if there are valid handlers,
 and if so it adds an appropriate listener. 
*/

function handleEvent(event) {
	var listeners = activeListeners[event.type];
	if (listeners && listeners.length > 0) {
		listeners.forEach(function(listener) {
			listener.node.removeEventListener(event.type, listener.fn, listener.capture);
		});
	}
	listeners = activeListeners[event.type] = [];
	
	var target = event.target;
	for (var current=target; current!=document; current=current.parentNode) {
		var elementXBL = ElementXBL.getInterface(current);
		if (!elementXBL) continue;
		var bindings = elementXBL.xblImplementations;
		if (!bindings || bindings.length <= 0) continue;
		bindings.forEach(function(binding) { // there should be a maximum of one, but this creates a closure
			binding.specification.handlers.forEach(function(handler) {
				if (!matchesEvent(handler, event, true)) return;
				var fn = function(e) {
					if (handler.stopPropagation) e.stopPropagation();
					if (handler.preventDefault) e.preventDefault();
					if (handler.action) handler.action.call(binding, e);
				}
				if (current == target) {
					if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.AT_TARGET }))
						listeners.push({ node: current, fn: fn, capture: false });
				}
				else {
					if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.CAPTURING_PHASE }))
						listeners.push({ node: current, fn: fn, capture: true });
					else if (phaseMatchesEvent(handler.eventPhase, { eventPhase: Event.BUBBLING_PHASE }))
						listeners.push({ node: current, fn: fn, capture: false });
				}
			});
		});
	}
	
	listeners.forEach(function(listener) {
		listener.node.addEventListener(event.type, listener.fn, listener.capture);
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
		keydown: true, keyup: true, textInput: true, DOMAttrModified: true,
		load: true, unload: true, abort: true, error: true, select: true, change: true, submit: true, reset: true, resize: true, scroll: true };
	var xblMouseEvents = { click: true, dblclick: true, mousedown: true, mouseup: true, mouseover: true, mouseout: true, mousemove: true, mousewheel: true };
	var xblKeyboardEvents = { keydown: true, keyup: true };
	var xblTextEvents = { textInput: true };
	var xblMutationEvents = { DOMAttrModified: true }; // TODO
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

	// MutationEvents
	if (evType in xblMutationEvents) {
		if (handler.attrName) {
			// mutation attribute name
			if (handler.attrName != event.attrName) return false;
			// mutation type
			if (handler.attrChange.length > 0 && handler.attrChange.indexOf(event.attrChange) < 0) return false;
			// previous value
			if (MutationEvent.MODIFICATION == event.attrChange || MutationEvent.REMOVAL == event.attrChange)
				if (null != handler.prevValue && handler.prevValue != event.prevValue) return false;
			// new value
			if (MutationEvent.MODIFICATION == event.attrChange || MutationEvent.ADDITION == event.attrChange)
				if (null != handler.newValue && handler.newValue != event.newValue) return false;
		}
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

var addBinding = function(spec, element) {
	var elementXBL = ElementXBL.getInterface(element, true);
	var firstBinding = elementXBL.xblImplementations[0];
	if (firstBinding && firstBinding.context == Binding.CSS_CONTEXT) {
		if (firstBinding.xblLeftDocument) firstBinding.xblLeftDocument(); // TODO isolate
		elementXBL.xblImplementations.shift();
	}
	var binding = Object.create(spec.prototype);
	binding.specification = spec;
	binding.context = Binding.CSS_CONTEXT;
	binding.boundElement = element;
	elementXBL.xblImplementations.unshift(binding);
	if (binding.xblBindingAttached) binding.xblBindingAttached();
	if (binding.xblEnteredDocument) binding.xblEnteredDocument();
}

var applyBinding = function(spec, selector, root) {
	if (!root) root = document.documentElement;
	if (Element.matchesSelector(root, selector)) addBinding(spec, root);
	forEach(root.querySelectorAll(selector), function(el) { addBinding(spec, el); });
}

var CSS = xbl.CSS = {}

extend(CSS, {
	
addBinding: function(selector, spec) {
	var alreadyTriggered = (enteringBindingRules.length > 0);
	enteringBindingRules.push({ specification: spec, selector: selector });
	if (!alreadyTriggered) setTimeout(function() {
		var rule; while (rule = enteringBindingRules.shift()) {
			applyBinding(rule.specification, rule.selector);
			cssBindingRules.push(rule);
		}
	});
},
removeBinding: function(selector, spec) {
	
}

});

extend(xbl, {

// TODO domReady: function() { this.nodeInserted(document.documentElement); },

nodeInserted: function(node) { // NOTE called AFTER node inserted into document
	cssBindingRules.forEach(function(rule) {
		applyBinding(rule.specification, rule.selector, node);
	});
},
nodeRemoved: function(node) { // NOTE called BEFORE node removed from document
	
}

});

xbl.Binding = Binding;
xbl.baseBinding = Binding.create(); // NOTE now we can extend baseBinding.prototype

return xbl;

})();

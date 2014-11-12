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

var _ = window._ || Meeko.stuff; // WARN this could potentially use underscore.js / lodash.js but HAS NOT BEEN TESTED!!!

/*
 ### Task queuing and isolation
	TODO Only intended for use by Promise. Should this be externally available?
 */

var Task = Meeko.Task = (function() {

// NOTE Task.asap could use window.setImmediate, except for
// IE10 CPU contention bugs http://codeforhire.com/2013/09/21/setimmediate-and-messagechannel-broken-on-internet-explorer-10/

var asapQueue = [];
var deferQueue = [];
var errorQueue = [];
var scheduled = false;
var processing = false;

function asap(fn) {
	asapQueue.push(fn);
	if (processing) return;
	if (scheduled) return;
	schedule(processTasks);
	scheduled = true;
}

function defer(fn) {
	if (processing) {
		deferQueue.push(fn);
		return;
	}
	asap(fn);
}

function delay(fn, timeout) {
	if (timeout <= 0 || timeout == null) {
		defer(fn);
		return;
	}

	setTimeout(function() {
		try { fn(); }
		catch (error) { postError(error); }
		processTasks();
	}, timeout);
}

// NOTE schedule used to be approx: setImmediate || postMessage || setTimeout
var schedule = window.setTimeout;

function processTasks() {
	processing = true;
	var fn;
	while (asapQueue.length) {
		fn = asapQueue.shift();
		if (typeof fn !== 'function') continue;
		try { fn(); }
		catch (error) { postError(error); }
	}
	scheduled = false;
	processing = false;
	
	asapQueue = deferQueue;
	deferQueue = [];
	if (asapQueue.length) {
		schedule(processTasks);
		scheduled = true;
	}
	
	throwErrors();
	
}


function postError(error) {
	errorQueue.push(error);
}

var throwErrors = (function() { // TODO maybe it isn't worth isolating on platforms that don't have dispatchEvent()

var evType = vendorPrefix + "-error";
var throwErrors = (window.dispatchEvent) ?
function() {
	var handlers = _.map(errorQueue, function(error) {
		return function() { throw error; };
	});
	_.forEach(handlers, function(handler) {
		window.addEventListener(evType, handler, false);
	});
	var e = document.createEvent("Event");
	e.initEvent(evType, true, true);
	window.dispatchEvent(e);
	_.forEach(handlers, function(handler) {
		window.removeEventListener(evType, handler, false);
	});
	errorQueue = [];
} :
function() { // FIXME shouldn't need this
	var handlers = _.map(errorQueue, function(error) {
		return function() { throw error; };
	});
	_.forEach(handlers, function(handler) {
		setTimeout(handler);
	});
	errorQueue = [];
}

return throwErrors;
})();


return {
	asap: asap,
	defer: defer,
	delay: delay,
	postError: postError
};

})(); // END Task

/*
 ### Promise
 WARN: This was based on early DOM Futures specification. This has been evolved towards ES6 Promises.
 */
var Promise = Meeko.Promise = (function() {
	
var Promise = function(init) { // `init` is called as init(resolve, reject)
	if (!(this instanceof Promise)) return new Promise(init);
	
	var promise = this;
	promise._initialize();

	function resolve(result) {
		if (typeof result !== 'function') {
			promise._resolve(result);
			return;
		}
		try { promise._resolve(result()); }
		catch (err) { promise._reject(err); }
	}
	function reject(error) {
		if (typeof error !== 'function') {
			promise._reject(error);
			return;
		}
		try { promise._reject(error()); }
		catch (err) { promise._reject(err); }
	}

	var resolver;
	if (typeof init !== 'function') { // if `init` is not a function then assign resolve() / reject() elsewhere
		resolver = (typeof init === 'object' && init !== null) ? init : promise;
		resolver.resolve = resolve;
		resolver.reject = reject;
	}
	
	Task.asap(function() {
		if (promise._willCatch == null) promise._willCatch = false;
		if (resolver) return;
		try { init(resolve, reject); }
		catch(error) { reject(error); }
	});
	// NOTE promise is returned by `new` invocation
}

_.defaults(Promise.prototype, {

_initialize: function() {
	var promise = this;
	promise._acceptCallbacks = [];
	promise._rejectCallbacks = [];
	promise._accepted = null;
	promise._result = null;
	promise._willCatch = null;
	promise._processing = false;
},

_accept: function(result, sync) { // NOTE equivalent to "accept algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	promise._accepted = true;
	promise._result = result;
	promise._requestProcessing(sync);
},

_resolve: function(value, sync) { // NOTE equivalent to "resolve algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	if (value != null && typeof value.then === 'function') {
		try {
			value.then(
				function(result) { promise._resolve(result); },
				function(error) { promise._reject(error); }
			);
		}
		catch(error) {
			promise._reject(error, sync);
		}
		return;
	}
	// else
	promise._accept(value, sync);
},

_reject: function(error, sync) { // NOTE equivalent to "reject algorithm". External calls MUST NOT use sync
	var promise = this;
	if (promise._accepted != null) return;
	promise._accepted = false;
	promise._result = error;
	if (!promise._willCatch) {
		Task.postError(error);
	}
	else promise._requestProcessing(sync);
},

_requestProcessing: function(sync) { // NOTE schedule callback processing. TODO may want to disable sync option
	var promise = this;
	if (promise._accepted == null) return;
	if (promise._processing) return;
	if (sync) {
		promise._processing = true;
		promise._process();
		promise._processing = false;
	}
	else {
		Task.asap(function() {
			promise._processing = true;
			promise._process();
			promise._processing = false;
		});
	}
},

_process: function() { // NOTE process a promises callbacks
	var promise = this;
	var result = promise._result;
	var callbacks, cb;
	if (promise._accepted) {
		promise._rejectCallbacks.length = 0;
		callbacks = promise._acceptCallbacks;
	}
	else {
		promise._acceptCallbacks.length = 0;
		callbacks = promise._rejectCallbacks;
	}
	while (callbacks.length) {
		cb = callbacks.shift();
		if (typeof cb === 'function') cb(result);
	}
},

then: function(acceptCallback, rejectCallback) {
	var promise = this;
	return new Promise(function(resolve, reject) {
		var acceptWrapper = acceptCallback ?
			wrapResolve(acceptCallback, resolve, reject) :
			function(value) { resolve(value); }
	
		var rejectWrapper = rejectCallback ? 
			wrapResolve(rejectCallback, resolve, reject) :
			function(error) { reject(error); }
	
		promise._acceptCallbacks.push(acceptWrapper);
		promise._rejectCallbacks.push(rejectWrapper);
	
		if (promise._willCatch == null) promise._willCatch = true;
	
		promise._requestProcessing();
		
	});
},

'catch': function(rejectCallback) { // WARN 'catch' is unexpected identifier in IE8-
	var promise = this;
	return promise.then(null, rejectCallback);
}

});


/* Functional composition wrapper for `then` */
function wrapResolve(callback, resolve, reject) {
	return function() {
		try {
			var value = callback.apply(undefined, arguments); 
			resolve(value);
		} catch(error) {
			reject(error);
		}
	}
}


_.defaults(Promise, {

resolve: function(value) {
return new Promise(function(resolve, reject) {
	resolve(value);
});
},

reject: function(error) {
return new Promise(function(resolve, reject) {
	reject(error);
});
}

});


/*
 ### Async functions
   wait(test) waits until test() returns true
   asap(fn) returns a promise which is fulfilled / rejected by fn which is run asap after the current micro-task
   delay(timeout) returns a promise which fulfils after timeout ms
   pipe(startValue, [fn1, fn2, ...]) will call functions sequentially
 */
var wait = (function() { // TODO wait() isn't used much. Can it be simpler?
	
var tests = [];

function wait(fn) {
return new Promise(function(resolve, reject) {
	var test = { fn: fn, resolve: resolve, reject: reject };
	asapTest(test);
});
}

function asapTest(test) {
	asap(test.fn)
	.then(function(done) {
		if (done) test.resolve();
		else deferTest(test);
	},
	function(error) {
		test.reject(error);
	});
}

function deferTest(test) {
	var started = tests.length > 0;
	tests.push(test);
	if (!started) Task.delay(poller, Promise.pollingInterval); // NOTE polling-interval is configured below
}

function poller() {
	var currentTests = tests;
	tests = [];
	_.forEach(currentTests, asapTest);
}

return wait;

})();

var asap = function(fn) { return Promise.resolve().then(fn); }

function delay(timeout) {
return new Promise(function(resolve, reject) {
	if (timeout <= 0 || timeout == null) Task.defer(resolve);
	else Task.delay(resolve, timeout);
});
}

function pipe(startValue, fnList) {
	var promise = Promise.resolve(startValue);
	while (fnList.length) { 
		var fn = fnList.shift();
		promise = promise.then(fn);
	}
	return promise;
}

Promise.pollingInterval = defaultOptions['polling_interval'];

_.defaults(Promise, {
	asap: asap, delay: delay, wait: wait, pipe: pipe
});

return Promise;

})();


/*
 ### DOM utility functions
 */

var DOM = Meeko.DOM = (function() {

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

var getData = function(node) { // TODO should this throw if no data?
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
	switch (scope.nodeType) {
	case 1:
		break;
	case 9: case 11:
		// TODO what to do with document / fragment
		return selector;
	default:
		// TODO should other node types throw??
		return selector;
	}
	var id = scope.id;
	if (!id) id = scope.id = uniqueId(scope);
	var scopePrefix = '#' + id + ' ';
	return scopePrefix + selector.replace(/,(?![^(]*\))/g, ', ' + scopePrefix); // COMMA (,) that is not inside BRACKETS. Technically: not followed by a RHB ')' unless first followed by LHB '(' 
}

var findId = function(id, doc) {
	if (!id) return;
	if (!doc) doc = document;
	if (!doc.getElementById) throw 'Context for findId() must be a Document node';
	return doc.getElementById(id);
	// WARN would need a work around for broken getElementById in IE <= 7
}

var findAll = document.querySelectorAll ?
function(selector, node, scope) {
	if (!node) node = document;
	if (scope) {
		if (!scope.nodeType) scope = node; // `true` but not the scope element
		selector = absolutizeSelector(selector, scope);
	}
	return _.toArray(node.querySelectorAll(selector));
} :
function() { throw "findAll() not supported"; };

var find = document.querySelector ?
function(selector, node, scope) {
	if (!node) node = document;
	if (scope) {
		if (!scope.nodeType) scope = node; // `true` but not the scope element
		selector = absolutizeSelector(selector, scope);
	}
	return node.querySelector(selector);
} :
function() { throw "find() not supported"; };

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
	findId: findId, find: find, findAll: findAll, matches: matches, closest: closest,
	contains: contains,
	addEventListener: addEventListener, removeEventListener: removeEventListener
}

})();

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
	binding.implementation = _.create(definition.prototype);
	binding.listeners = [];
	binding.inDocument = null; // TODO state assertions in attach/onenter/leftDocumentCallback/detach
}

_.assign(Binding, {

getInterface: function(element) {
	var nodeData = DOM.getData(element);
	if (nodeData && nodeData.implementation) return nodeData;
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
},

managedEvents: [],

manageEvent: function(type) {
	if (_.contains(this.managedEvents, type)) return;
	this.managedEvents.push(type);
	window.addEventListener(type, function(event) {
		// NOTE stopPropagation() prevents custom default-handlers from running. DOMSprockets nullifies it.
		event.stopPropagation = function() { logger.warn('event.stopPropagation() is a no-op'); }
		event.stopImmediatePropagation = function() { logger.warn('event.stopImmediatePropagation() is a no-op'); }
	}, true);
}

});

_.assign(Binding.prototype, {

attach: function(element) {
	var binding = this;
	var definition = binding.definition;
	var implementation = binding.implementation;

	implementation.element = element; 
	if (definition.handlers) _.forEach(definition.handlers, function(handler) {
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
	var element = implementation.element;
	var type = handler.type;
	var capture = (handler.eventPhase == 1); // Event.CAPTURING_PHASE
	if (capture) {
		logger.warn('Capture phase for events not supported');
		return; // FIXME should this convert to bubbling instead??
	}

	Binding.manageEvent(type);
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
	var element = implementation.element;
	var type = fn.type;
	var capture = fn.capture;
	var target = (element === document.documentElement && _.contains(redirectedWindowEvents, type)) ? window : element; 
	DOM.removeEventListener(target, type, fn, capture);	
},

});

// WARN polyfill Event#preventDefault
if (!('defaultPrevented' in Event.prototype)) { // NOTE ensure defaultPrevented works
	Event.prototype.defaultPrevented = false;
	Event.prototype._preventDefault = Event.prototype.preventDefault;
	Event.prototype.preventDefault = function() { this.defaultPrevented = true; this._preventDefault(); }
}

function handleEvent(event, handler) {
	var bindingImplementation = this;
	var target = event.target;
	var current = bindingImplementation.element;
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
		throw 'Capture phase for events not supported';
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
	this.prototype = desc.prototype;
	this.handlers = desc.handlers && desc.handlers.length ? desc.handlers.slice(0) : [];
	this.callbacks = desc.callbacks;
}

function BindingRule(selector, bindingDefn) {
	this.selector = selector;
	this.definition = bindingDefn;
}


var bindingRules = [];
var enteringRules = [];

// FIXME BIG BALL OF MUD
function applyRuleToEnteredElement(rule, element) { // FIXME compare current and new CSS specifities
	var binding = Binding.getInterface(element);
	if (binding && binding.definition !== rule.definition) {
		logger.warn('Binding rule applied when binding already present');
		return;
	}
	if (!binding) binding = attachBinding(rule.definition, element);
	if (!binding.inDocument) binding.enteredDocumentCallback();
}

function applyRuleToEnteredTree(rule, root) {
	if (!root || root === document) root = document.documentElement;
	if (DOM.matches(root, rule.selector)) applyRuleToEnteredElement(rule, root);
	_.forEach(DOM.findAll(rule.selector, root), function(el) { applyRuleToEnteredElement(rule, el); });
}

function applyEnteringRules() {
	var rule; while (rule = enteringRules.shift()) {
		var definition = rule.definition;
		applyRuleToEnteredTree(rule /* , document */);
		bindingRules.unshift(rule); // TODO splice in specificity order
	}
}

_.assign(sprockets, {

registerElement: function(tagName, desc) { // FIXME test tagName
	var alreadyTriggered = (enteringRules.length > 0);
	var bindingDefn = new BindingDefinition(desc);
	var selector = tagName + ', [is=' + tagName + ']'; // TODO why should @is be supported??
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
	_.forEach(DOM.findAll('*', node), Binding.leftDocumentCallback);
}

});

// FIXME this auto DOM Monitoring could have horrible performance for DOM sorting operations
// It would be nice to have a list of moved nodes that could potentially be ignored
var observe = (window.MutationObserver) ?
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
		Task.asap(function() { sprockets.nodeInserted(e.target); });
	}, true);
	document.body.addEventListener('DOMNodeRemoved', function(e) {
		e.stopPropagation();
		if (!started) return;
		Task.asap(function() { sprockets.nodeRemoved(e.target); });
		// FIXME
	}, true);
};


var SprocketDefinition = function(prototype) {
	var constructor = function(element) {
		return sprockets.cast(element, constructor);
	}
	constructor.prototype = prototype;
	return constructor;
}

_.assign(sprockets, {

registerComponent: function(tagName, sprocket, extras) {
	var defn = { prototype: sprocket.prototype };
	if (extras) _.defaults(defn, extras);
	if (!defn.callbacks) defn.callbacks = {};
	var onattached = defn.callbacks.attached;
	defn.callbacks.attached = function() {
		var binding = this;
		if (defn.sprockets) _.forEach(defn.sprockets, function(rule) {
			sprockets.register({ scope: binding.element, matches: rule.matches }, rule.sprocket);
		});
		if (onattached) return onattached.call(this);
	};
	sprockets.registerElement(tagName, defn);
},

register: function(options, sprocket) {
	if (typeof options === 'string') options = {
		scope: document,
		matches: options
	}
	var nodeData = DOM.getData(options.scope);
	if (!nodeData) {
		nodeData = {};
		DOM.setData(options.scope, nodeData);
	}
	var nodeSprockets = nodeData.sprockets;
	if (!nodeSprockets) nodeSprockets = nodeData.sprockets = [];
	var sprocketRule = { matches: options.matches, definition: sprocket };
	nodeSprockets.unshift(sprocketRule); // WARN last registered means highest priority. Is this appropriate??
},

evolve: function(base, properties) {
	var prototype = _.create(base.prototype);
	var sub = new SprocketDefinition(prototype);
	var baseDefinition = base.prototype.__definition__;
	var definition = prototype.__definition__ = (baseDefinition) ? _.create(baseDefinition) : {};
	if (properties) sprockets.defineProperties(sub, properties);
	return sub;
},

defineProperties: function(sprocket, properties) {
	var prototype = sprocket.prototype;
	var definition = prototype.__definition__ || (prototype.__definition__ = {});
	_.forOwn(properties, function(desc, name) {
		switch (typeof desc) {
		case 'object':
			definition[name] = desc;
			Object.defineProperty(prototype, name, {
				get: function() { throw 'Attempt to get an ARIA property'; },
				set: function() { throw 'Attempt to set an ARIA property'; }
			});
			break;
		default:
			prototype[name] = desc;
			break;
		}
	});
},

matches: function(element, sprocket) {
	var binding = Binding.getInterface(element);
	if (binding) return prototypeMatchesSprocket(binding.implementation, sprocket);
	var declaredSprocketRule = getSprocketRule(element);
	if (declaredSprocketRule && prototypeMatchesSprocket(declaredSprocketRule.definition.prototype, sprocket)) return true;
	return false;
},

closest: function(element, sprocket) { // FIXME optimize by attaching sprocket here
	for (var node=element; node; node=node.parentNode) {
		if (!sprockets.matches(node, sprocket)) continue;
		return node;
	}
},

findAll: function(element, sprocket) {
	var rule = getMatchingSprocketRule(element, sprocket);
	return DOM.findAll(rule.matches, element); // FIXME should be scoped to rule.scope??
},

find: function(element, sprocket) {
	var rule = getMatchingSprocketRule(element, sprocket);
	return DOM.find(rule.matches, element); // FIXME should be scoped to rule.scope??
},

cast: function(element, sprocket) {
	var implementation = sprockets.getInterface(element);
	if (prototypeMatchesSprocket(implementation, sprocket)) return implementation;
	throw 'Attached sprocket is not compatible';
},

getInterface: function(element) {
	var binding = Binding.getInterface(element);
	if (binding) return binding.implementation;
	for (var node=sprockets.getScope(element.parentNode); node; node=sprockets.getScope(node.parentNode)) {
		var nodeData = DOM.getData(node);
		var sprocketRules = nodeData.sprockets;
		_.some(sprocketRules, function(rule) {
			var prototype = rule.definition.prototype;
			if (!DOM.matches(element, rule.matches)) return false; // TODO should be using relative selector
			binding = attachBinding(rule.definition, element);
			return true;
		});
		if (binding) return binding.implementation;
	}
	throw "No sprocket declared";
},

getScope: function(element) {
	for (var node=element; node; node=node.parentNode) {
		if (!DOM.hasData(node)) continue;
		var nodeData = DOM.getData(node);
		var sprocketRules = nodeData.sprockets;
		if (!sprocketRules) continue;
		return node;
	}
}

});

function getSprocketRule(element) {
	for (var scope=sprockets.getScope(element.parentNode); scope; scope=sprockets.getScope(scope.parentNode)) {
		var sprocketRule;
		var nodeData = DOM.getData(scope);
		var sprocketRules = nodeData.sprockets;
		_.some(sprocketRules, function(rule) {
			if (!DOM.matches(element, rule.matches)) return false; // TODO should be using relative selector
			sprocketRule = { scope: scope };
			_.defaults(sprocketRule, rule);
			return true;
		});
		if (sprocketRule) return sprocketRule;
	}
}

function getMatchingSprocketRule(element, sprocket) {
	for (var scope=sprockets.getScope(element); scope; scope=sprockets.getScope(scope.parentNode)) {
		var sprocketRule;
		var nodeData = DOM.getData(scope);
		var sprocketRules = nodeData.sprockets;
		_.some(sprocketRules, function(rule) {
			if (typeof sprocket === 'string') {
				if (rule.definition.prototype.role !== sprocket) return false;
			}
			else {
				if (sprocket.prototype !== rule.definition.prototype && !isPrototypeOf(sprocket.prototype, rule.definition.prototype)) return false;
			}
			sprocketRule = { scope: scope };
			_.defaults(sprocketRule, rule);
			return true;
		});
		if (sprocketRule) return sprocketRule;
	}
}

function prototypeMatchesSprocket(prototype, sprocket) {
	if (typeof sprocket === 'string') return (prototype.role === sprocket);
	else return (sprocket.prototype === prototype || isPrototypeOf(sprocket.prototype, prototype));
}

sprockets.trigger = function(target, type, params) { // NOTE every JS initiated event is a custom-event
	if (typeof type === 'object') {
		params = type;
		type = params.type;
	}
	var bubbles = 'bubbles' in params ? !!params.bubbles : true;
	var cancelable = 'cancelable' in params ? !!params.cancelable : true;
	if (typeof type !== 'string') throw 'trigger() called with invalid event type';
	var detail = params && params.detail;
	var event = document.createEvent('CustomEvent');
	event.initCustomEvent(type, bubbles, cancelable, detail);
	if (params) _.defaults(event, params);
	return target.dispatchEvent(event);
}


var basePrototype = {};
sprockets.Base = new SprocketDefinition(basePrototype); // NOTE now we can extend basePrototype

return sprockets;

})(); // END sprockets


/* Extend BaseSprocket.prototype */
(function() {

var _ = Meeko.stuff;
var DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, Base = sprockets.Base;


_.assign(Base.prototype, {

find: function(selector, scope) { return DOM.find(selector, this.element, scope); },
findAll: function(selector, scope) { return DOM.findAll(selector, this.element, scope); },
matches: function(selector, scope) { return DOM.matches(this.element, selector, scope); },
closest: function(selector, scope) { return DOM.closest(this.element, selector, scope); },

contains: function(otherNode) { return DOM.contains(this.element, otherNode); },

attr: function(name, value) {
	var element = this.element;
	if (typeof value === 'undefined') return element.getAttribute(name);
	if (value == null) element.removeAttribute(name);
	else element.setAttribute(name, value);
},
hasClass: function(token) {
	var element = this.element;
	var text = element.getAttribute('class');
	if (!text) return false;
	return _.contains(_.words(text), token);
},
addClass: function(token) {
	var element = this.element;
	var text = element.getAttribute('class');
	if (!text) {
		element.setAttribute('class', token);
		return;
	}
	if (_.contains(_.words(text), token)) return;
	var n = text.length,
		space = (n && text.charAt(n-1) !== ' ') ? ' ' : '';
	text += space + token;
	element.setAttribute('class', text);
},
removeClass: function(token) {
	var element = this.element;
	var text = element.getAttribute('class');
	if (!text) return;
	var prev = _.words(text);
	var next = [];
	_.forEach(prev, function(str) { if (str !== token) next.push(str); });
	if (prev.length === next.length) return;
	element.setAttribute('class', next.join(' '));
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

trigger: function(type, params) {
	return sprockets.trigger(this.element, type, params);
}


});

// Element.prototype.hidden and visibilitychange event
var Element = window.Element || window.HTMLElement;

Object.defineProperty(Element.prototype, '$', {
	get: function() { return sprockets.getInterface(this); }
});


if (!('hidden' in document.documentElement)) {

	var head = document.head;
	var fragment = document.createDocumentFragment();
	var style = document.createElement("style");
	fragment.appendChild(style); // NOTE on IE this realizes style.styleSheet 
	
	var cssText = '*[hidden] { display: none; }\n';
	if (style.styleSheet) style.styleSheet.cssText = cssText;
	else style.textContent = cssText;
	
	head.insertBefore(style, head.firstChild);

	Object.defineProperty(Element.prototype, 'hidden', {
		get: function() { return this.hasAttribute('hidden'); },
		set: function(value) {
			if (!!value) this.setAttribute('hidden', '');
			else this.removeAttribute('hidden');
			
			// IE9 has a reflow bug. The following forces a reflow. TODO surely there's another work-around??
			var elementDisplayStyle = this.style.display;
			var computedDisplayStyle = window.getComputedStyle(this, null);
			this.style.display = computedDisplayStyle;
			this.style.display = elementDisplayStyle;
		}
	});

}

var SUPPORTS_ATTRMODIFIED = (function() {
	var supported = false;
	var div = document.createElement('div');
	div.addEventListener('DOMAttrModified', function(e) { supported = true; }, false);
	div.setAttribute('hidden', '');
	return supported;
})();

if (window.MutationObserver) {

	var observer = new MutationObserver(function(mutations, observer) {
		_.forEach(mutations, function(entry) {
			triggerVisibilityChangeEvent(entry.target);
		});
	});
	observer.observe(document, { attributes: true, attributeFilter: ['hidden'], subtree: true });
	
}
else if (SUPPORTS_ATTRMODIFIED) {
	
	document.addEventListener('DOMAttrModified', function(e) {
		e.stopPropagation();
		if (e.attrName !== 'hidden') return;
		triggerVisibilityChangeEvent(e.target);
	}, true);
	
}
else logger.warn('element.visibilitychange event will not be supported');

function triggerVisibilityChangeEvent(target) { // FIXME this should be asynchronous
	var visibilityState = target.hidden ? 'hidden' : 'visible';
	sprockets.trigger(target, 'visibilitychange', { bubbles: false, cancelable: false, detail: visibilityState }); // NOTE doesn't bubble to avoid clash with same event on document
}

})();

(function() {

var _ = Meeko.stuff;
var DOM = Meeko.DOM;
var sprockets = Meeko.sprockets, Base = sprockets.Base;

var ariaProperties = { // TODO this lookup is only for default values
	hidden: false,
	selected: false,
	expanded: true
}

var ARIA = sprockets.evolve(Base, {

role: 'roletype',

aria: function(name, value) {
	var element = this.element;
	var defn = ariaProperties[name];
	if (defn == null) throw 'No such aria property: ' + name;

	if (name === 'hidden') {
		if (typeof value === 'undefined') return element.hasAttribute('hidden');
		if (!value) element.removeAttribute('hidden');
		else element.setAttribute('hidden', '');
		return;
	}
	
	var ariaName = 'aria-' + name;
	var type = typeof defn;
	if (typeof value === 'undefined') {
		var result = element.getAttribute(ariaName);
		switch(type) {
		case 'string': default: return result;
		case 'boolean': return result === 'false' ? false : result == null ? undefined : true;
		}
	}
	if (value == null) element.removeAttribute(ariaName);
	else switch(type) {
		case 'string': default:
			element.setAttribute(ariaName, value);
			break;
		case 'boolean':
			var bool = value === 'false' ? 'false' : value === false ? 'false' : 'true';
			element.setAttribute(ariaName, bool);
			break;
	}
},

ariaCan: function(name, value) {
	var desc = this.__definition__[name];
	if (!desc) throw 'Property not defined: ' + name;
	if (desc.type !== 'boolean' || desc.can && !desc.can.call(this)) return false;
	return true;
},

ariaToggle: function(name, value) {
	var desc = this.__definition__[name];
	if (!desc) throw 'Property not defined: ' + name;
	if (desc.type !== 'boolean' || desc.can && !desc.can.call(this)) throw 'Property can not toggle: ' + name;
	var oldValue = desc.get.call(this);
	
	if (typeof value === 'undefined') desc.set.call(this, !oldValue);
	else desc.set.call(this, !!value);
	return oldValue;
},

ariaGet: function(name) {
	var desc = this.__definition__[name];
	if (!desc) throw 'Property not defined: ' + name;
	return desc.get.call(this); // TODO type and error handling
},

ariaSet: function(name, value) {
	var desc = this.__definition__[name];
	if (!desc) throw 'Property not defined: ' + name;
	return desc.set.call(this, value); // TODO type and error handling
}

});

var RoleType = sprockets.evolve(ARIA, {

hidden: {
	type: 'boolean',
	can: function() { return true; },
	get: function() { return this.aria('hidden'); },
	set: function(value) { this.aria('hidden', !!value); }
}

});

sprockets.ARIA = ARIA;
sprockets.RoleType = RoleType;
sprockets.register('*', RoleType);

var Element = window.Element || window.HTMLElement;

_.defaults(Element.prototype, { // NOTE this assumes that the declared sprocket for every element is derived from ARIA

aria: function(prop, value) {
	return this.$.aria(prop, value);
},

ariaCan: function(prop) {
	return this.$.ariaCan(prop);
},

ariaToggle: function(prop, value) {
	return this.$.ariaToggle(prop, value);
},

ariaGet: function(prop) {
	return this.$.ariaGet(prop);
},

ariaSet: function(prop, value) {
	return this.$.ariaSet(prop, value);
},

ariaFind: function(role) {
	return sprockets.find(this, role);
},

ariaFindAll: function(role) {
	return sprockets.findAll(this, role);	
},

ariaClosest: function(role) {
	return sprockets.closest(this, role);
}
	
});


})();


})(window);
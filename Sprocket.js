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
element.dispatchEvent - IE9+
Object.create - IE9+
*/

/* FIXME
- event modifiers aren't filtering
- everything in the sprockets code (apart from the Binding implementation) is a BIG BALL OF MUD
*/

if (!this.Meeko) this.Meeko = {};

(function(window) {

var document = window.document;

var defaultOptions = {
	'log_level': 'warn'
}

var vendorPrefix = 'meeko';

/*
 ### Utility functions
 These might (or might not) be lodash equivalents
 */

if (!Meeko.stuff) Meeko.stuff = (function() {

// TODO do string utils needs to sanity check args?
var uc = function(str) { return str ? str.toUpperCase() : ''; }
var lc = function(str) { return str ? str.toLowerCase() : ''; }

function ucFirst(str) {
	return str ? str.charAt(0).toUpperCase() + str.substr(1) : '';
}
function camelCase(str) {
	return str ?
		_.map(str.split('-'), function(part, i) { return i === 0 ? part :
		ucFirst(part); }).join('') : ''; 
}
function kebabCase(str) {
	return str ?
	_.map(str.split(/(?=[A-Z])/), function(part, i) { return i === 0 ? part :
	_.lc(part); }).join('-') : '';
}

var includes = function(a, item) {
	for (var n=a.length, i=0; i<n; i++) if (a[i] === item) return true;
	return false;
}

var forEach = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) fn.call(context, a[i], i, a); }

var some = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (fn.call(context, a[i], i, a)) return true; } return false; }

var every = function(a, fn, context) { for (var n=a.length, i=0; i<n; i++) { if (!fn.call(context, a[i], i, a)) return false; } return true; }

var map = function(a, fn, context) {
	var output = [];
	for (var n=a.length, i=0; i<n; i++) {
		var value = a[i];
		output[i] = fn ? 
			fn.call(context, value, i, a) :
			value;
	}
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
	forOwn(src, function(val, key, object) {
		if (typeof this[key] !== 'undefined') return;
		this[key] = object[key];
	}, dest);
	return dest;
}

var assign = function(dest, src) {
	forOwn(src, function(val, key, object) {
		this[key] = object[key];
	}, dest);
	return dest;
}

return {
	uc: uc, lc: lc, ucFirst: ucFirst, camelCase: camelCase, kebabCase: kebabCase, words: words, // string
	contains: includes, // FIXME deprecated
	includes: includes, forEach: forEach, some: some, every: every, map: map, filter: filter, find: find, // array
	forOwn: forOwn, isEmpty: isEmpty, defaults: defaults, assign: assign, extend: assign // object
}

})();

var _ = window._ || Meeko.stuff; // WARN this could potentially use underscore.js / lodash.js but HAS NOT BEEN TESTED!!!

/*
 ### Logger (minimal implementation - can be over-ridden)
 */
if (!Meeko.logger) Meeko.logger = (function() {

var logger = {};

var levels = logger.levels = _.words('none error warn info debug');

_.forEach(levels, function(name, num) {
	
levels[name] = num;
logger[name] = window.console ?
	console[name] ? 
		console[name].apply ?
			function() { if (num <= logger.LOG_LEVEL) console[name].apply(console, arguments); } :
			function() { if (num <= logger.LOG_LEVEL) console[name](_.map(arguments).join(' ')); } // IE9

		: function() { if (num <= logger.LOG_LEVEL) console.log(_.map(arguments).join(' ')); }
	: function() {}; 

}, this);

logger.LOG_LEVEL = levels[defaultOptions['log_level']]; // DEFAULT

return logger;

})(); // end logger definition

var logger = Meeko.logger;



/*
 ### Task queuing and isolation
	TODO Only intended for use by Promise. Should this be externally available?
 */

var Task = Meeko.Task = (function() {

// NOTE Task.asap could use window.setImmediate, except for
// IE10 CPU contention bugs http://codeforhire.com/2013/09/21/setimmediate-and-messagechannel-broken-on-internet-explorer-10/

// FIXME record Task statistics

var frameRate = 60; // FIXME make this a boot-option??
var frameInterval = 1000 / frameRate;
var frameExecutionRatio = 0.75; // FIXME another boot-option??
var frameExecutionTimeout = frameInterval * frameExecutionRatio;

var performance = window.performance && window.performance.now ? window.performance :
	Date.now ? Date :
	{
		now: function() { return (new Date).getTime(); }
	};

var schedule = (function() { 
	// See http://creativejs.com/resources/requestanimationframe/
	var fn = window.requestAnimationFrame;
	if (fn) return fn;

	_.some(_.words('moz ms o webkit'), function(vendor) {
		var name = vendor + 'RequestAnimationFrame';
		if (!window[name]) return false;
		fn = window[name];
		return true;
	});
	if (fn) return fn;

	var lastTime = 0;
	var callback;
	fn = function(cb, element) {
		if (callback) throw 'schedule() only allows one callback at a time';
		callback = cb;
		var currTime = performance.now();
		var timeToCall = Math.max(0, frameInterval - (currTime - lastTime));
		var id = window.setTimeout(function() { 
			lastTime = performance.now();
			var cb = callback;
			callback = undefined;
			cb(lastTime, element); 
		}, timeToCall);
		return id;
	};
	
	return fn;
})();


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

var execStats = {};
var frameStats = {};

function resetStats() {
	_.forEach([execStats, frameStats], function(stats) {
		_.assign(stats, {
			count: 0,
			totalTime: 0,
			minTime: Infinity,
			maxTime: 0,
			avgTime: 0
		});
	});
}
resetStats();

function updateStats(stats, currTime) {
	stats.count++;
	stats.totalTime += currTime;
	if (currTime < stats.minTime) stats.minTime = currTime;
	if (currTime > stats.maxTime) stats.maxTime = currTime;
}

function getStats() {
	var exec = _.assign({}, execStats);
	var frame = _.assign({}, frameStats);
	exec.avgTime = exec.totalTime / exec.count;
	frame.avgTime = frame.totalTime / frame.count;
	return {
		exec: exec,
		frame: frame
	}
}

var lastStartTime = performance.now();
function getTime(bRemaining) {
	var delta = performance.now() - lastStartTime;
	if (!bRemaining) return delta;
	return frameExecutionTimeout - delta;
}

var idle = true;
function processTasks() {
	var startTime = performance.now();
	if (!idle) updateStats(frameStats, startTime - lastStartTime);
	lastStartTime = startTime;
	processing = true;
	var fn;
	var currTime;
	while (asapQueue.length) {
		fn = asapQueue.shift();
		if (typeof fn !== 'function') continue;
		try { fn(); }
		catch (error) { postError(error); }
		currTime = getTime();
		if (currTime >= frameExecutionTimeout) break;
	}
	scheduled = false;
	processing = false;
	if (currTime) updateStats(execStats, currTime);
	
	asapQueue = asapQueue.concat(deferQueue);
	deferQueue = [];
	if (asapQueue.length) {
		schedule(processTasks);
		scheduled = true;
		idle = false;
	}
	else idle = true;
	
	throwErrors();
	
}

function postError(error) {
	errorQueue.push(error);
}

var throwErrors = (function() {

var evType = vendorPrefix + '-error';
function throwErrors() {
	var handlers = createThrowers(errorQueue);
	_.forEach(handlers, function(handler) {
		window.addEventListener(evType, handler, false);
	});
	var e = document.createEvent('Event');
	e.initEvent(evType, true, true);
	window.dispatchEvent(e);
	_.forEach(handlers, function(handler) {
		window.removeEventListener(evType, handler, false);
	});
	errorQueue = [];
}

function createThrowers(list) {
	return _.map(list, function(error) {
		return function() {
			if (logger.LOG_LEVEL >= logger.levels.indexOf('debug')) {
				if (error && error.stack) logger.error(error.stack);
				else logger.error('Untraceable error: ' + error); // FIXME why are these occuring??
			}
			throw error;
		};
	});
}

return throwErrors;
})();

return {
	asap: asap,
	defer: defer,
	delay: delay,
	getTime: getTime,
	getStats: getStats,
	resetStats: resetStats,
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

	try { init(resolve, reject); }
	catch(error) { reject(error); }

	// NOTE promise is returned by `new` invocation but anyway
	return promise;

	// The following are hoisted
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
}

_.defaults(Promise, {

applyTo: function(object) {
	var resolver = {}
	var promise = new Promise(function(resolve, reject) {
		resolver.resolve = resolve;
		resolver.reject = reject;
	});
	if (!object) object = promise;
	_.assign(object, resolver);
	return promise;
},

isPromise: function(value) {
	return value instanceof Promise;
},

isThenable: function(value) {
	return value != null && typeof value.then === 'function';
}

});

_.defaults(Promise.prototype, {

_initialize: function() {
	var promise = this;
	_.defaults(promise, {
		/* 
			use lazy creation for callback lists - 
			with synchronous inspection they may never be called
		// _fulfilCallbacks: [],
		// _rejectCallbacks: [],
		*/
		isPending: true,
		isFulfilled: false,
		isRejected: false,
		value: undefined,
		reason: undefined,
		_willCatch: false,
		_processing: false
	});
},

/*
See https://github.com/promises-aplus/synchronous-inspection-spec/issues/6 and
https://github.com/petkaantonov/bluebird/blob/master/API.md#synchronous-inspection
*/
inspectState: function() { 
	return this;
},

_fulfil: function(result, sync) { // NOTE equivalent to 'fulfil algorithm'. External calls MUST NOT use sync
	var promise = this;
	if (!promise.isPending) return;
	promise.isPending = false;
	promise.isRejected = false;
	promise.isFulfilled = true;
	promise.value = result;
	promise._requestProcessing(sync);
},

_resolve: function(value, sync) { // NOTE equivalent to 'resolve algorithm'. External calls MUST NOT use sync
	var promise = this;
	if (!promise.isPending) return;
	if (Promise.isPromise(value) && !value.isPending) {
		if (value.isFulfilled) promise._fulfil(value.value, sync);
		else /* if (value.isRejected) */ promise._reject(value.reason, sync);
		return;
	}
	/* else */ if (Promise.isThenable(value)) {
		try {
			value.then(
				function(result) { promise._resolve(result, true); },
				function(error) { promise._reject(error, true); }
			);
		}
		catch(error) {
			promise._reject(error, sync);
		}
		return;
	}
	/* else */ promise._fulfil(value, sync);
},

_reject: function(error, sync) { // NOTE equivalent to 'reject algorithm'. External calls MUST NOT use sync
	var promise = this;
	if (!promise.isPending) return;
	promise.isPending = false;
	promise.isFulfilled = false;
	promise.isRejected = true;
	promise.reason = error;
	if (!promise._willCatch) {
		Task.postError(error);
	}
	else promise._requestProcessing(sync);
},

_requestProcessing: function(sync) { // NOTE schedule callback processing. TODO may want to disable sync option
	var promise = this;
	if (promise.isPending) return;
	if (!promise._willCatch) return;
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
	var result;
	var callbacks, cb;
	if (promise.isFulfilled) {
		result = promise.value;
		callbacks = promise._fulfilCallbacks;
	}
	else {
		result = promise.reason;
		callbacks = promise._rejectCallbacks;
	}

	// NOTE callbacks may not exist
	delete promise._fulfilCallbacks;
	delete promise._rejectCallbacks;
	if (callbacks) while (callbacks.length) {
		cb = callbacks.shift();
		if (typeof cb === 'function') cb(result);
	}
},

then: function(fulfilCallback, rejectCallback) {
	var promise = this;
	return new Promise(function(resolve, reject) {
		var fulfilWrapper = fulfilCallback ?
			wrapResolve(fulfilCallback, resolve, reject) :
			function(value) { resolve(value); }
	
		var rejectWrapper = rejectCallback ? 
			wrapResolve(rejectCallback, resolve, reject) :
			function(error) { reject(error); }
	
		if (!promise._fulfilCallbacks) promise._fulfilCallbacks = [];
		if (!promise._rejectCallbacks) promise._rejectCallbacks = [];
		
		promise._fulfilCallbacks.push(fulfilWrapper);
		promise._rejectCallbacks.push(rejectWrapper);
	
		promise._willCatch = true;
	
		promise._requestProcessing();
		
	});
},

'catch': function(rejectCallback) { // WARN 'catch' is unexpected identifier in IE8-
	var promise = this;
	return promise.then(undefined, rejectCallback);
}

});


/* Functional composition wrapper for `then` */
function wrapResolve(callback, resolve, reject) {
	return function() {
		try {
			var value = callback.apply(undefined, arguments); 
			resolve(value);
		} catch (error) {
			reject(error);
		}
	}
}


_.defaults(Promise, {

resolve: function(value) {
	if (Promise.isPromise(value)) return value;
	var promise = Object.create(Promise.prototype);
	promise._initialize();
	promise._resolve(value);
	return promise;
},

reject: function(error) { // FIXME should never be used
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
	var test = { fn: fn };
	var promise = Promise.applyTo(test);
	asapTest(test);
	return promise;
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
	if (!started) Task.defer(poller);
}

function poller() {
	var currentTests = tests;
	tests = [];
	_.forEach(currentTests, asapTest);
}

return wait;

})();

var asap = function(value) { // FIXME asap(fn) should execute immediately
	if (typeof value === 'function') return Promise.resolve().then(value); // will defer
	if (Promise.isPromise(value)) {
		if (value.isPending) return value; // already deferred
		if (Task.getTime(true) <= 0) return value.then(function(val) { return val; }); // will defer
		return value; // not-deferred
	}
	if (Promise.isThenable(value)) return Promise.resolve(value); // will defer
	// NOTE otherwise we have a non-thenable, non-function something
	if (Task.getTime(true) <= 0) return Promise.resolve(value).then(function(val) { return val; }); // will defer
	return Promise.resolve(value); // not-deferred
}

// FIXME implement Promise.defer(value_or_fn_or_promise)


function delay(timeout) { // FIXME delay(timeout, value_or_fn_or_promise)
	return new Promise(function(resolve, reject) {
		if (timeout <= 0 || timeout == null) Task.defer(resolve);
		else Task.delay(resolve, timeout);
	});
}

function pipe(startValue, fnList) { // TODO make more efficient with sync introspection
	var promise = Promise.resolve(startValue);
	for (var n=fnList.length, i=0; i<n; i++) {
		var fn = fnList[i];
		promise = promise.then(fn);
	}
	return promise;
}

function reduce(a, accumulator, fn, context) {
return new Promise(function(resolve, reject) {
	var length = a.length;
	var i = 0;

	var predictor = new TimeoutPredictor(256, 2);
	process(accumulator);
	return;

	function process(acc) {
		var prevTime;
		var j = 0;
		var timeoutCount = 1;

		while (i < length) {
			if (Promise.isThenable(acc)) {
				if (!Promise.isPromise(acc) || !acc.isFulfilled) { 
					acc.then(process, reject);
					if (j <= 0 || !prevTime || i >= length) return;
					var currTime = Task.getTime(true);
					predictor.update(j, prevTime - currTime);
					return;
				}
				/* else */ acc = acc.value;
			}
			try {
				acc = fn.call(context, acc, a[i], i, a);
				i++; j++;
			}
			catch (error) {
				reject(error);
				return;
			}
			if (i >= length) break;
			if (j < timeoutCount) continue;

			// update timeout counter data
			var currTime = Task.getTime(true); // NOTE *remaining* time
			if (prevTime) predictor.update(j, prevTime - currTime); // NOTE based on *remaining* time
			if (currTime <= 0) {
				// Could use Promise.resolve(acc).then(process, reject)
				// ... but this is considerably quicker
				// FIXME ... although with TimeoutPredictor maybe it doesn't matter
				Task.asap(function() { process(acc); });
				return;
			}
			j = 0;
			timeoutCount = predictor.getTimeoutCount(currTime);
			prevTime = currTime;
		}
		resolve(acc);
	}
});
}

function TimeoutPredictor(max, mult) { // FIXME test args are valid
	if (!(this instanceof TimeoutPredictor)) return new TimeoutPredictor(max, mult);
	var predictor = this;
	_.assign(predictor, {
		count: 0,
		totalTime: 0,
		currLimit: 1,
		absLimit: !max ? 256 : max < 1 ? 1 : max,
		multiplier: !mult ? 2 : mult < 1 ? 1 : mult
	});
}

_.assign(TimeoutPredictor.prototype, {

update: function(count, delta) {
	var predictor = this;
	predictor.count += count;
	predictor.totalTime += delta;
},

getTimeoutCount: function(remainingTime) {
	var predictor = this;
	if (predictor.count <= 0) return 1;
	var avgTime = predictor.totalTime / predictor.count;
	var n = Math.floor( remainingTime / avgTime );
	if (n <= 0) return 1;
	if (n < predictor.currLimit) return n;
	n = predictor.currLimit;
	if (predictor.currLimit >= predictor.absLimit) return n;
	predictor.currLimit = predictor.multiplier * predictor.currLimit;
	if (predictor.currLimit < predictor.absLimit) return n;
	predictor.currLimit = predictor.absLimit;
	// FIXME do methods other than reduce() use TimeoutPredictor??
	logger.debug('Promise.reduce() hit absLimit: ', predictor.absLimit);
	return n;
}


});

_.defaults(Promise, {
	asap: asap, delay: delay, wait: wait, pipe: pipe, reduce: reduce
});

return Promise;

})();


/*
 ### DOM utility functions
 */

var DOM = Meeko.DOM = (function() {

// TODO all this node manager stuff assumes that nodes are only released on unload
// This might need revising

// TODO A node-manager API would be useful elsewhere

var nodeIdProperty = vendorPrefix + 'ID';
var nodeCount = 0; // used to generated node IDs
var nodeTable = []; // list of tagged nodes
var nodeStorage = {}; // hash of storage for nodes, keyed off `nodeIdProperty`

var uniqueId = function(node) {
	var nodeId = node[nodeIdProperty];
	if (nodeId) return nodeId;
	nodeId = '__' + vendorPrefix + '_' + nodeCount++;
	node[nodeIdProperty] = nodeId; // WARN would need `new String(nodeId)` in IE<=8
			// so that node cloning doesn't copy the node ID property
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

var getTagName = function(el) {
	return el && el.nodeType === 1 ? _.lc(el.tagName) : '';
}

var matchesSelector;
_.some(_.words('moz webkit ms o'), function(prefix) {
	var method = prefix + 'MatchesSelector';
	if (document.documentElement[method]) {
		matchesSelector = function(element, selector) { return (element && element.nodeType === 1) ? element[method](selector) : false; }
		return true;
	}
	return false;
});


var matches = matchesSelector ?
function(element, selector, scope) {
	if (scope) selector = absolutizeSelector(selector, scope);
	return matchesSelector(element, selector);
} :
function() { throw Error('matches not supported'); } // NOTE fallback

var closest = matchesSelector ?
function(element, selector, scope) {
	if (scope) selector = absolutizeSelector(selector, scope);
	for (var el=element; el && el.nodeType === 1 && el!==scope; el=el.parentNode) {
		if (matchesSelector(el, selector)) return el;
	}
	return;
} :
function() { throw Error('closest not supported'); } // NOTE fallback

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
	if (!doc.getElementById) throw Error('Context for findId() must be a Document node');
	return doc.getElementById(id);
	// WARN would need a work around for broken getElementById in IE <= 7
}

var findAll = document.querySelectorAll ?
function(selector, node, scope) {
	if (!node) node = document;
	if (!node.querySelectorAll) return [];
	if (scope) {
		if (!scope.nodeType) scope = node; // `true` but not the scope element
		selector = absolutizeSelector(selector, scope);
	}
	return _.map(node.querySelectorAll(selector));
} :
function() { throw Error('findAll() not supported'); };

var find = document.querySelector ?
function(selector, node, scope) {
	if (!node) node = document;
	if (!node.querySelector) return null;
	if (scope) {
		if (!scope.nodeType) scope = node; // `true` but not the scope element
		selector = absolutizeSelector(selector, scope);
	}
	return node.querySelector(selector);
} :
function() { throw Error('find() not supported'); };

var siblings = function(conf, refNode, conf2, refNode2) {
	
	conf = _.lc(conf);
	if (conf2) {
		conf2 = _.lc(conf2);
		if (conf === 'ending' || conf === 'before') throw Error('siblings() startNode looks like stopNode');
		if (conf2 === 'starting' || conf2 === 'after') throw Error('siblings() stopNode looks like startNode');
		if (!refNode2 || refNode2.parentNode !== refNode.parentNode) throw Error('siblings() startNode and stopNode are not siblings');
	}
	
	var nodeList = [];
	if (!refNode || !refNode.parentNode) return nodeList;
	var node, stopNode, first = refNode.parentNode.firstChild;

	switch (conf) {
	case 'starting': node = refNode; break;
	case 'after': node = refNode.nextSibling; break;
	case 'ending': node = first; stopNode = refNode.nextSibling; break;
	case 'before': node = first; stopNode = refNode; break;
	default: throw Error(conf + ' is not a valid configuration in siblings()');
	}
	if (conf2) switch (conf2) {
	case 'ending': stopNode = refNode2.nextSibling; break;
	case 'before': stopNode = refNode2; break;
	}
	
	if (!node) return nodeList; // FIXME is this an error??
	for (;node && node!==stopNode; node=node.nextSibling) nodeList.push(node);
	return nodeList;
}

var contains = // WARN `contains()` means contains-or-isSameNode
document.documentElement.contains && function(node, otherNode) {
	if (node === otherNode) return true;
	if (node.contains) return node.contains(otherNode);
	if (node.documentElement) return node.documentElement.contains(otherNode); // FIXME won't be valid on pseudo-docs
	return false;
} ||
document.documentElement.compareDocumentPosition && function(node, otherNode) { return (node === otherNode) || !!(node.compareDocumentPosition(otherNode) & 16); } ||
function(node, otherNode) { throw Error('contains not supported'); };

function dispatchEvent(target, type, params) { // NOTE every JS initiated event is a custom-event
	if (typeof type === 'object') {
		params = type;
		type = params.type;
	}
	var bubbles = 'bubbles' in params ? !!params.bubbles : true;
	var cancelable = 'cancelable' in params ? !!params.cancelable : true;
	if (typeof type !== 'string') throw Error('trigger() called with invalid event type');
	var detail = params && params.detail;
	var event = document.createEvent('CustomEvent');
	event.initCustomEvent(type, bubbles, cancelable, detail);
	if (params) _.defaults(event, params);
	return target.dispatchEvent(event);
}


var SUPPORTS_ATTRMODIFIED = (function() {
	var supported = false;
	var div = document.createElement('div');
	div.addEventListener('DOMAttrModified', function(e) { supported = true; }, false);
	div.setAttribute('hidden', '');
	return supported;
})();

// DOM node visibilitychange implementation and monitoring
if (!('hidden' in document.documentElement)) { // implement 'hidden' for older browsers

	var head = document.head;
	// NOTE on <=IE8 this needs a styleSheet work-around
	var style = document.createElement('style');
	
	var cssText = '*[hidden] { display: none; }\n';
	style.textContent = cssText;
	
	head.insertBefore(style, head.firstChild);

	Object.defineProperty(Element.prototype, 'hidden', {
		get: function() { return this.hasAttribute('hidden'); },
		set: function(value) {
			if (!!value) this.setAttribute('hidden', '');
			else this.removeAttribute('hidden');
			
			// IE9 has a reflow bug. The following forces a reflow. FIXME can we stop suporting IE9
			var elementDisplayStyle = this.style.display;
			var computedDisplayStyle = window.getComputedStyle(this, null);
			this.style.display = computedDisplayStyle;
			this.style.display = elementDisplayStyle;
		}
	});
}

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

// FIXME this should use observers, not events
function triggerVisibilityChangeEvent(target) {
	var visibilityState = target.hidden ? 'hidden' : 'visible';
	DOM.dispatchEvent(target, 'visibilitychange', { bubbles: false, cancelable: false, detail: visibilityState }); // NOTE doesn't bubble to avoid clash with same event on document (and also performance)
}

function isVisible(element) {
	var closestHidden = DOM.closest(element, '[hidden]');
	return (!closestHidden);
}


function whenVisible(element) { // FIXME this quite possibly causes leaks if closestHidden is removed from document before removeEventListener
	return new Promise(function(resolve, reject) {	
		var closestHidden = DOM.closest(element, '[hidden]');
		if (!closestHidden) {
			resolve();
			return;
		}
		var listener = function(e) {
			if (e.target.hidden) return;
			closestHidden.removeEventListener('visibilitychange', listener, false);
			whenVisible(element).then(resolve);
		}
		closestHidden.addEventListener('visibilitychange', listener, false);
	});
}

var insertNode = function(conf, refNode, node) { // like imsertAdjacentHTML but with a node and auto-adoption
	var doc = refNode.ownerDocument;
	if (doc.adoptNode) node = doc.adoptNode(node); // Safari 5 was throwing because imported nodes had been added to a document node
	switch(conf) {
	case 'beforebegin': refNode.parentNode.insertBefore(node, refNode); break;
	case 'afterend': refNode.parentNode.insertBefore(node, refNode.nextSibling); break;
	case 'afterbegin': refNode.insertBefore(node, refNode.firstChild); break;
	case 'beforeend': refNode.appendChild(node); break;
	case 'replace': refNode.parentNode.replaceChild(node, refNode);
	}
	return refNode;
}


return {
	uniqueId: uniqueId, setData: setData, getData: getData, hasData: hasData, // FIXME releaseNodes
	getTagName: getTagName,
	contains: contains, matches: matches,
	findId: findId, find: find, findAll: findAll, closest: closest, siblings: siblings,
	SUPPORTS_ATTRMODIFIED: SUPPORTS_ATTRMODIFIED, 
	dispatchEvent: dispatchEvent,
	isVisible: isVisible, whenVisible: whenVisible,
	insertNode: insertNode
}

})();

Meeko.controllers = (function() { // TODO should this be under Meeko.sprockets??

return {

values: {},

listeners: {},

create: function(name) {
        this.values[name] = [];
        this.listeners[name] = [];
},

has: function(name) {
        return (name in this.values);
},

get: function(name) { 
        if (!this.has(name)) throw name + ' is not a registered controller';
        return this.values[name];
},

set: function(name, value) {
        if (!this.has(name)) throw name + ' is not a registered controller';
        if (value === false || value == null) value = [];
        else if (typeof value === 'string' || !('length' in value)) value = [ value ];
        var oldValue = this.values[name];
        if (_.difference(value, oldValue).length <= 0) return;
        this.values[name] = value;
        _.forEach(this.listeners[name], function(listener) {
                Task.asap(function() { listener(value); });
        });     
},

listen: function(name, listener) {
        if (!this.has(name)) throw name + ' is not a registered controller';
        this.listeners[name].push(listener);
        var value = this.values[name];
        Task.asap(function() { listener(value) });
}

};

})();


this.Meeko.sprockets = (function() {
/* FIXME
	- auto DOM monitoring for node insertion / removal should be a start() option
	- manual control must allow attached, enteredView, leftView lifecycle management
	- binding registration must be blocked after sprockets.start()
*/

var sprockets = {};

var activeListeners = {};

function attachBinding(definition, element) {
	var binding;
	if (DOM.hasData(element)) {
		binding = DOM.getData(element);
		if (binding.definition !== rule.definition) throw Error('Mismatch between definition and binding already present');
		logger.warn('Binding definition applied when binding already present');
		return binding;
	}
	binding = new Binding(definition);
	DOM.setData(element, binding);
	binding.attach(element);
	return binding;
}

function enableBinding(element) {
	if (!DOM.hasData(element)) throw Error('No binding attached to element');
	var binding = DOM.getData(element);
	if (!binding.inDocument) binding.enteredDocumentCallback();
}

// TODO disableBinding() ??

function detachBinding(element) {
	if (!DOM.hasData(element)) throw Error('No binding attached to element');
	var binding = DOM.getData(element);
	if (binding.inDocument) binding.leftDocumentCallback();
	binding.detach();
	DOM.setData(element, null);
}


var Binding = function(definition) {
	var binding = this;
	binding.definition = definition;
	binding.object = Object.create(definition.prototype);
	binding.listeners = [];
	binding.inDocument = null; // TODO state assertions in attach/onenter/leftDocumentCallback/detach
}

_.assign(Binding, {

getInterface: function(element) {
	var nodeData = DOM.getData(element);
	if (nodeData && nodeData.object) return nodeData;
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
	if (_.includes(this.managedEvents, type)) return;
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
	var object = binding.object;

	object.element = element; 
	if (definition.handlers) _.forEach(definition.handlers, function(handler) {
		var listener = binding.addHandler(handler); // handler might be ignored ...
		if (listener) binding.listeners.push(listener);// ... resulting in an undefined listener
	});
	
	binding.attachedCallback();
},

attachedCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var object = binding.object;

	binding.inDocument = false;
	if (definition.attached) definition.attached.call(object); // FIXME try/catch
},

enteredDocumentCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var object = binding.object;

	binding.inDocument = true;
	if (definition.enteredDocument) definition.enteredDocument.call(object);	
},

leftDocumentCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var object = binding.object;

	binding.inDocument = false;
	if (definition.leftDocument) definition.leftDocument.call(object);	
},

detach: function() {
	var binding = this;
	var definition = binding.definition;
	var object = binding.object;

	_.forEach(binding.listeners, binding.removeListener, binding);
	binding.listeners.length = 0;
	
	binding.detachedCallback();
},

detachedCallback: function() {
	var binding = this;
	var definition = binding.definition;
	var object = binding.object;
	
	binding.inDocument = null;
	if (definition.detached) definition.detached.call(object);	
},

addHandler: function(handler) {
	var binding = this;
	var object = binding.object;
	var element = object.element;
	var type = handler.type;
	var capture = (handler.eventPhase == 1); // Event.CAPTURING_PHASE
	if (capture) {
		logger.warn('Capture phase for events not supported');
		return; // FIXME should this convert to bubbling instead??
	}

	Binding.manageEvent(type);
	var fn = function(event) {
		if (fn.normalize) event = fn.normalize(event);
		return handleEvent.call(object, event, handler);
	}
	fn.type = type;
	fn.capture = capture;
	element.addEventListener(type, fn, capture);
	return fn;
},

removeListener: function(fn) {
	var binding = this;
	var object = binding.object;
	var element = object.element;
	var type = fn.type;
	var capture = fn.capture;
	var target = (element === document.documentElement && _.includes(redirectedWindowEvents, type)) ? window : element; 
	target.removeEventListener(type, fn, capture);	
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
	if (!DOM.hasData(current)) throw Error('Handler called on non-bound element');
	if (!matchesEvent(handler, event, true)) return; // NOTE the phase check is below
	var delegator = current;
	if (handler.delegator) {
		var el = DOM.closest(target, handler.delegator, current);
		if (!el) return;
		delegator = el;
	}
	switch (handler.eventPhase) { // FIXME DOMSprockets doesn't intend to support eventPhase
	case 1:
		throw Error('Capture phase for events not supported');
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
	if (null == config.event) logger.warn('Invalid handler: event property undeclared');

	function lookupValue(attrName, lookup) {
		var attrValue = config[attrName];
		var result;
		if (attrValue) {
			result = lookup[attrValue];
			if (null == result) logger.info('Ignoring invalid property ' + attrName + ': ' + attrValue);
		}
		return result;
	}

	handler.eventPhase = lookupValue('phase', {
		'capture': 1, // Event.CAPTURING_PHASE,
		'target': 2, // Event.AT_TARGET,
		'bubble': 3, // Event.BUBBLING_PHASE,
		'default-action': 0x78626C44 
	}) || 0;

	handler.preventDefault = lookupValue('default-action', {
		'cancel' : true,
		'perform' : false
	}) || false;

	handler.stopPropagation = lookupValue('propagate', {
		'stop': true,
		'continue': false
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
	handler.button = attrText_to_numArray('button');
	handler.clickCount = attrText_to_numArray('click-count');
	
	// keyboard
	handler.key = config.key;
	handler.keyLocation = [];
	var keyLocationText = config['key-location']
	var keyLocationStrings =  (keyLocationText) ? keyLocationText.split(/\s+/) : [];
	for (var n=keyLocationStrings.length, i=0; i<n; i++) {
		var text = keyLocationStrings[i];
		switch (text) {
			case 'standard': handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_STANDARD); break;
			case 'left': handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_LEFT); break;
			case 'right': handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_RIGHT); break;
			case 'numpad': handler.keyLocation.push(KeyboardEvent.DOM_KEY_LOCATION_NUMPAD); break;
		}
	}

	// text
	handler.text = config.text;
	
	// non-standard
	handler.filter = new RegExp(config.filter, '');
	
	// mutation
	// FIXME not supported anymore
	handler.attrName = config['attr-name'];
	handler.attrChange = [];
	var attrChangeText = config['attr-change'];
	var attrChangeStrings =  (attrChangeText) ? attrChangeText.split(/\s+/) : [];
	for (var n=attrChangeStrings.length, i=0; i<n; i++) {
		var text = attrChangeStrings[i];
		switch (text) {
			case 'modification': handler.attrChange.push(MutationEvent.MODIFICATION); break;
			case 'addition': handler.attrChange.push(MutationEvent.ADDITION); break;
			case 'removal': handler.attrChange.push(MutationEvent.REMOVAL); break;
		}
	}
	handler.prevValue = config['prev-value'];
	handler.newValue = config['new-value'];
	
	// modifiers
	// TODO should handler.modifiers be {} or []?
	if (null != config['modifiers']) {
		handler.modifiers = [];
		var modifiersText = config['modifiers'];
		var modifiersStrings = (modifiersText) ? modifiersText.split(/\s+/) : [];
		for (var n=modifiersStrings, i=0; i<n; i++) {
			var text = modifiersStrings[i];
			var m;
			m = /^([+-]?)([a-z]+)(\??)$/.exec(text);
			if (m) {
				var key = m[2];
				var condition = 1; // MUST
				if (m[3]) condition = 0; // OPTIONAL
				else if (m[1] == '+') condition = 1; // MUST
				else if (m[1] == '-') condition = -1; // MUST NOT
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
			if (!_.includes(handler.button, event.button) == -1) return false;
		}
		if (handler.clickCount && handler.clickCount.length) { 
			var count = 1;
			// if ('dblclick' == event.type) count = 2;
			if ('click' == event.type) count = (event.detail) ? event.detail : 1;
			if (!_.includes(handler.clickCount, count)) return false;
		}
		if (handler.modifiers) {
			if (!modifiersMatchEvent(handler.modifiers, event)) return false;
		}
	}

	// KeyboardEvents
	// NOTE some of these are non-standard
	var ourKeyIdentifiers = {
		Backspace: 'U+0008', Delete: 'U+007F', Escape: 'U+001B', Space: 'U+0020', Tab: 'U+0009'
	}

	if (evType in xblKeyboardEvents) {
		if (handler.key) {
			var success = false;
			var keyId = event.keyIdentifier;
			if (/^U\+00....$/.test(keyId)) { // TODO Needed for Safari-2. It would be great if this test could be done elsewhere
				keyId = keyId.replace(/^U\+00/, 'U+');
			}
			if (handler.key != keyId && ourKeyIdentifiers[handler.key] != keyId) return false;
		}

		// TODO key-location		
		if (handler.modifiers || handler.key) {
			if (!modifiersMatchEvent(handler.modifiers || [ 'none' ], event)) return false;
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
				case 'none':
					if (evMods_any) return false;
					break;
	
				case 'any':
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
	_.assign(this, desc);
	if (!this.prototype) {
		if (desc.prototype) this.prototype = desc.prototype;
		else this.prototype = null;
	}
	if (!this.handlers) this.handlers = [];
}

function BindingRule(selector, bindingDefn) {
	this.selector = selector;
	this.definition = bindingDefn;
}


var bindingRules = sprockets.rules = [];

function findAllBindees(root, bExcludeRoot) {
	var selector = _.map(bindingRules, function(rule) { return rule.selector; })
		.join(', ');
	var result = DOM.findAll(selector, root);
	if (!bExcludeRoot && DOM.matches(root, selector)) result.unshift(root);
	return result;
}

var started = false;
var manualDOM = false;

_.assign(sprockets, {

registerElement: function(tagName, defn) { // FIXME test tagName
	if (started) throw Error('sprockets management already started');
	if (defn.rules) logger.warn('registerElement() does not support rules. Try registerComposite()');
	var bindingDefn = new BindingDefinition(defn);
	var selector = tagName + ', [is=' + tagName + ']'; // TODO why should @is be supported??
	var rule = new BindingRule(selector, bindingDefn);
	bindingRules.push(rule);
	return rule;
},

start: function(options) {
	if (started) throw Error('sprockets management has already started');
	started = true;
	if (options && options.manual) manualDOM = true;
	nodeInserted(document.body);
	if (!manualDOM) observe(nodeInserted, nodeRemoved);
},

insertNode: function(conf, refNode, node) {
	if (!started) throw Error('sprockets management has not started yet');
	if (!manualDOM) throw Error('Must not use sprockets.insertNode: auto DOM monitoring');
	var doc = refNode.ownerDocument;
	if (doc !== document || !DOM.contains(document, refNode)) throw Error('sprockets.insertNode must insert into `document`');
	if (doc.adoptNode) node = doc.adoptNode(node); // Safari 5 was throwing because imported nodes had been added to a document node
	switch(conf) {
	case 'beforebegin': refNode.parentNode.insertBefore(node, refNode); break;
	case 'afterend': refNode.parentNode.insertBefore(node, refNode.nextSibling); break;
	case 'afterbegin': refNode.insertBefore(node, refNode.firstChild); break;
	case 'beforeend': refNode.appendChild(node); break;
	default: throw Error('Unsupported configuration in sprockets.insertNode: ' + conf);
	// TODO maybe case 'replace' which will call sprockets.removeNode() first
	}
	nodeInserted(node);
	return node;
},

removeNode: function(node) {
	if (!started) throw Error('sprockets management has not started yet');
	if (!manualDOM) throw Error('Must not use sprockets.insertNode: auto DOM monitoring');
	var doc = node.ownerDocument;
	if (doc !== document || !DOM.contains(document, node)) throw Error('sprockets.removeNode must remove from `document`');
	node.parentNode.removeChild(node);
	nodeRemoved(node);
	return node;
}


});

var nodeInserted = function(node) { // NOTE called AFTER node inserted into document
	if (!started) throw Error('sprockets management has not started yet');
	if (node.nodeType !== 1) return;

	var bindees = findAllBindees(node);
	var composites = [];
	_.forEach(bindees, function(el) {
		_.some(bindingRules, function(rule) {
			if (!DOM.matches(el, rule.selector)) return false;
			var binding = attachBinding(rule.definition, el);
			if (binding && binding.rules) composites.push(el);
			return true;
		});
	});

	_.forEach(bindees, function(el) {
		enableBinding(el);
	});


	var composite = sprockets.getComposite(node);
	if (composite) applyCompositedRules(node, composite);

	while (composite = composites.shift()) applyCompositedRules(composite);
	
	return;
		
	function applyCompositedRules(node, composite) {
		if (!composite) composite = node;
		var rules = getRules(composite);
		if (rules.length <= 0) return;

		var walker = createCompositeWalker(node, false); // don't skipRoot
		var el;
		while (el = walker.nextNode()) {
			_.forEach(rules, function(rule) {
				var selector = rule.selector; // FIXME absolutizeSelector??
				if (!DOM.matches(el, selector)) return;
				var binding = attachBinding(rule.definition, el);
				rule.callback.call(binding.object, el);
			});
		}
	}
	
	function getRules(composite) { // buffer uses unshift so LIFO
		var rules = [];
		var binding = DOM.getData(composite);
		_.forEach(binding.rules, function(rule) {
			if (!rule.callback) return;
			var clonedRule = _.assign({}, rule);
			clonedRule.composite = composite;
			rules.unshift(clonedRule);
		});
		return rules;
	}
	
}

var nodeRemoved = function(node) { // NOTE called AFTER node removed document
	if (!started) throw Error('sprockets management has not started yet');
	if (node.nodeType !== 1) return;

	// TODO leftComponentCallback. Might be hard to implement *after* node is removed
	// FIXME the following logic maybe completely wrong
	var nodes = DOM.findAll('*', node);
	nodes.unshift(node);
	_.forEach(nodes, Binding.leftDocumentCallback);
}

// FIXME this auto DOM Monitoring could have horrible performance for DOM sorting operations
// It would be nice to have a list of moved nodes that could potentially be ignored
var observe = (window.MutationObserver) ?
function(onInserted, onRemoved) {
	var observer = new MutationObserver(function(mutations, observer) {
		if (!started) return;
		_.forEach(mutations, function(record) {
			if (record.type !== 'childList') return;
			_.forEach(record.addedNodes, onInserted, sprockets);
			_.forEach(record.removedNodes, onRemoved, sprockets);
		});
	});
	observer.observe(document.body, { childList: true, subtree: true });
	
	// FIXME when to call observer.disconnect() ??
} :
function(onInserted, onRemoved) { // otherwise assume MutationEvents. TODO is this assumption safe?
	document.body.addEventListener('DOMNodeInserted', function(e) {
		e.stopPropagation();
		if (!started) return;
 		// NOTE IE sends event for every descendant of the inserted node
		if (e.target.parentNode !== e.relatedNode) return;
		Task.asap(function() { onInserted(e.target); });
	}, true);
	document.body.addEventListener('DOMNodeRemoved', function(e) {
		e.stopPropagation();
		if (!started) return;
 		// NOTE IE sends event for every descendant of the inserted node
		if (e.target.parentNode !== e.relatedNode) return;
		Task.asap(function() { onRemoved(e.target); });
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

registerSprocket: function(selector, definition, callback) { // WARN this can promote any element into a composite
	var rule = {};
	var composite;
	if (typeof selector === 'string') {
		_.assign(rule, {
			selector: selector
		});
		composite = document;
	}
	else {
		_.assign(rule, selector);
		composite = selector.composite;
		delete rule.composite;
	}
	var nodeData = DOM.getData(composite); // NOTE nodeData should always be a binding
	if (!nodeData) {
		nodeData = {};
		DOM.setData(composite, nodeData);
	}
	var nodeRules = nodeData.rules;
	if (!nodeRules) nodeRules = nodeData.rules = [];
	rule.definition = definition;
	rule.callback = callback;
	nodeRules.unshift(rule); // WARN last registered means highest priority. Is this appropriate??
},

register: function(options, sprocket) {
	return sprockets.registerSprocket(options, sprocket);
},

registerComposite: function(tagName, definition) {
	var defn = _.assign({}, definition);
	var rules = defn.rules;
	delete defn.rules;
	if (!rules) logger.warn('registerComposite() called without any sprocket rules. Try registerElement()');
	var onattached = defn.attached;
	defn.attached = function() {
		var object = this;
		if (rules) _.forEach(rules, function(rule) {
			var selector = {
				composite: object.element
			}
			var definition = {};
			var callback;
			if (Array.isArray(rule)) {
				selector.selector = rule[0];
				definition = rule[1];
				callback = rule[2];
			}
			else {
				selector.selector = rule.selector;
				definition = rule.definition;
				callback = rule.callback;
			}
			sprockets.registerSprocket(selector, definition, callback);
		});
		if (onattached) return onattached.call(this);
	};
	return sprockets.registerElement(tagName, defn);
},

registerComponent: function(tagName, sprocket, extras) {
	var defn = { prototype: sprocket.prototype };
	if (extras) {
		defn.handlers = extras.handlers;
		if (extras.sprockets) _.forEach(extras.sprockets, function(oldRule) {
			if (!defn.rules) defn.rules = [];
			var rule = {
				selector: oldRule.matches,
				definition: oldRule.sprocket,
				callback: oldRule.enteredComponent
			}
			defn.rules.push(rule);
		});
		if (extras.callbacks) _.defaults(defn, extras.callbacks);
	}
	if (defn.rules) return sprockets.registerComposite(tagName, defn);
	else return sprockets.registerElement(tagName, defn);
},

evolve: function(base, properties) {
	var prototype = Object.create(base.prototype);
	var sub = new SprocketDefinition(prototype);
	var baseProperties = base.prototype.__properties__ || {};
	var subProperties = prototype.__properties__ = {};
	_.forOwn(baseProperties, function(desc, name) {
		subProperties[name] = Object.create(desc);
	});
	if (properties) sprockets.defineProperties(sub, properties);
	return sub;
},

defineProperties: function(sprocket, properties) {
	var prototype = sprocket.prototype;
	var definition = prototype.__properties__ || (prototype.__properties__ = {});
	_.forOwn(properties, function(desc, name) {
		switch (typeof desc) {
		case 'object':
			var propDesc = definition[name] || (definition[name] = {});
			_.assign(propDesc, desc);
			Object.defineProperty(prototype, name, {
				get: function() { throw Error('Attempt to get an ARIA property'); },
				set: function() { throw Error('Attempt to set an ARIA property'); }
			});
			break;
		default:
			prototype[name] = desc;
			break;
		}
	});
},

getPropertyDescriptor: function(sprocket, prop) {
	return sprocket.prototype.__properties__[prop];
},

_matches: function(element, sprocket, rule) { // internal utility method which is passed a "cached" rule
	var binding = Binding.getInterface(element);
	if (binding) return prototypeMatchesSprocket(binding.object, sprocket);
	if (rule && DOM.matches(element, rule.selector)) return true; // TODO should make rules scoped by rule.composite
	return false;
},

matches: function(element, sprocket, inComposite) {
	var composite;
	if (inComposite) {
		composite = sprockets.getComposite(element);
		if (!composite) return false;
	}
	var rule = getMatchingSprocketRule(element.parentNode, sprocket, inComposite);
	return sprockets._matches(element, sprocket, rule);
},

closest: function(element, sprocket, inComposite) {
	var composite;
	if (inComposite) {
		composite = sprockets.getComposite(element);
		if (!composite) return;
	}
	var rule = getMatchingSprocketRule(element.parentNode, sprocket, inComposite);
	for (var node=element; node && node.nodeType === 1; node=node.parentNode) {
		if (sprockets._matches(node, sprocket, rule)) return node;
		if (node === composite) return;
	}
},

findAll: function(element, sprocket) { // FIXME this search is blocked by descendant composites (scopes). Is this appropriate?
	var nodeList = [];
	var rule = getMatchingSprocketRule(element, sprocket);
	if (!rule) return nodeList;
	var walker = createCompositeWalker(element, true); // skipRoot
	
	var node;
	while (node = walker.nextNode()) {
		if (DOM.matches(node, rule.selector)) nodeList.push(node);
	}
	return nodeList;
},

find: function(element, sprocket) { // FIXME this search is blocked by descendant composites (scopes). Is this appropriate?
	var rule = getMatchingSprocketRule(element, sprocket);
	if (!rule) return null;
	var walker = createCompositeWalker(element, true); // skipRoot
	
	var node;
	while (node = walker.nextNode()) {
		if (DOM.matches(node, rule.selector)) return node;
	}
	return null;
},

cast: function(element, sprocket) {
	var object = sprockets.getInterface(element);
	if (prototypeMatchesSprocket(object, sprocket)) return object;
	throw Error('Attached sprocket is not compatible');
},

getInterface: function(element) {
	var binding = Binding.getInterface(element);
	if (binding) return binding.object;
	var rule = getSprocketRule(element);
	if (!rule) 	throw Error('No sprocket declared'); // WARN should never happen - should be a universal fallback
	var binding = attachBinding(rule.definition, element);
	return binding.object;
},

isComposite: function(node) {
	if (!DOM.hasData(node)) return false;
	var nodeData = DOM.getData(node);
	if (!nodeData.rules) return false;
	return true;
},

getComposite: function(element) { // WARN this can return `document`. Not sure if that should count
	for (var node=element; node; node=node.parentNode) {
		if (sprockets.isComposite(node)) return node;
	}
}

});

function getSprocketRule(element) {
	var sprocketRule;
	var composite = sprockets.getComposite(element);
	sprocketRule = getRuleFromComposite(composite, element);
	if (sprocketRule) return sprocketRule;
	return getRuleFromComposite(document, element);
}

function getRuleFromComposite(composite, element) {
	var sprocketRule;
	var nodeData = DOM.getData(composite);
	_.some(nodeData.rules, function(rule) {
		if (!DOM.matches(element, rule.selector)) return false; // TODO should be using relative selector
		sprocketRule = { composite: composite };
		_.defaults(sprocketRule, rule);
		return true;
	});
	if (sprocketRule) return sprocketRule;
}

function getMatchingSprocketRule(element, sprocket, inComposite) {
	var sprocketRule;
	var composite = sprockets.getComposite(element);
	sprocketRule = getMatchingRuleFromComposite(composite, sprocket);
	if (inComposite || sprocketRule) return sprocketRule;
	return getMatchingRuleFromComposite(document, sprocket);
}

function getMatchingRuleFromComposite(composite, sprocket) {
	var sprocketRule;
	var nodeData = DOM.getData(composite);
	_.some(nodeData.rules, function(rule) {
		if (typeof sprocket === 'string') {
			if (rule.definition.prototype.role !== sprocket) return false;
		}
		else {
			if (sprocket.prototype !== rule.definition.prototype && !isPrototypeOf(sprocket.prototype, rule.definition.prototype)) return false;
		}
		sprocketRule = { composite: composite };
		_.defaults(sprocketRule, rule);
		return true;
	});
	return sprocketRule;
}

function prototypeMatchesSprocket(prototype, sprocket) {
	if (typeof sprocket === 'string') return (prototype.role === sprocket);
	else return (sprocket.prototype === prototype || isPrototypeOf(sprocket.prototype, prototype));
}

function createCompositeWalker(root, skipRoot) {
	return document.createNodeIterator(
			root,
			1,
			acceptNode,
			null // IE9 throws if this irrelavent argument isn't passed
		);
	
	function acceptNode(el) {
		 return (skipRoot && el === root) ? NodeFilter.FILTER_SKIP : sprockets.isComposite(el) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; 
	}
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
	return _.includes(_.words(text), token);
},
addClass: function(token) {
	var element = this.element;
	var text = element.getAttribute('class');
	if (!text) {
		element.setAttribute('class', token);
		return;
	}
	if (_.includes(_.words(text), token)) return;
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
css: function(name, value) {
	var element = this.element;
	var isKebabCase = (name.indexOf('-') >= 0);
	if (typeof value === 'undefined') return isKebabCase ? element.style.getPropertyValue(name) : element.style[name];
	if (value == null || value === '') {
		if (isKebabCase) element.style.removeProperty(name);
		else element.style[name] = '';
	}
	else {
		if (isKebabCase) element.style.setProperty(name, value);
		else element.style[name] = value;
	}
},

trigger: function(type, params) {
	return DOM.dispatchEvent(this.element, type, params);
}


});

// Element.prototype.hidden and visibilitychange event
var Element = window.Element || window.HTMLElement;

Object.defineProperty(Element.prototype, '$', {
	get: function() { return sprockets.getInterface(this); }
});

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
	if (defn == null) throw Error('No such aria property: ' + name);

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
	var desc = this.__properties__[name];
	if (!desc) throw Error('Property not defined: ' + name);
	if (desc.type !== 'boolean' || desc.can && !desc.can.call(this)) return false;
	return true;
},

ariaToggle: function(name, value) {
	var desc = this.__properties__[name];
	if (!desc) throw Error('Property not defined: ' + name);
	if (desc.type !== 'boolean' || desc.can && !desc.can.call(this)) throw Error('Property can not toggle: ' + name);
	var oldValue = desc.get.call(this);
	
	if (typeof value === 'undefined') desc.set.call(this, !oldValue);
	else desc.set.call(this, !!value);
	return oldValue;
},

ariaGet: function(name) {
	var desc = this.__properties__[name];
	if (!desc) throw Error('Property not defined: ' + name);
	return desc.get.call(this); // TODO type and error handling
},

ariaSet: function(name, value) {
	var desc = this.__properties__[name];
	if (!desc) throw Error('Property not defined: ' + name);
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
},

ariaMatches: function(role) {
	return sprockets.matches(this, role);
}
	
});


})();


})(window);

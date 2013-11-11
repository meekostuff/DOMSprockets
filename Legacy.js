/*!
Legacy.js
Copyright 2007, 2013 Sean Hogan (http://www.meekostuff.net/)
MIT License
*/

/*
This script patches DOMSprockets with element selector and event handling utils.
*/

(function() {

/*
CSS Parser

This API and implementation is a Frankenstein of:
1. W3C Simple API for CSS
	http://www.w3.org/TR/SAC
	http://www.w3.org/Stypushle/CSS/SAC/doc/org/w3c/css/sac/package-summary.html
2. CSS Editing and Selectors Object Models
	Daniel Glazman
	http://daniel.glazman.free.fr/csswg/csseom/csseom-0.00-01.htm
3. XPath model: axis/node-test/predicate
*/

/*
FIXME
- tagNames should be upper-case in HTML, lower-case in XML
TODO
- stylesheet & property parsing
*/

var _ = window.Meeko.stuff, forEach = _.forEach, extend = _.extend;

function parseSelectors(selectorText) {
	var text = selectorText;
	
	var selectorList = [];
	var selector = new Selector();
	var relSelector = new RelativeSelector();
	relSelector.relationType = DESCENDANT_RELATIVE;

	var currentCondition = null; 
	var invert = false;

	function mergeCondition(c) {
		currentCondition = c;
		relSelector.conditions.push(c);
	}

	var state = 0, foundMatch;
	function test(regex, nextState, fn) {
		var m;
		if (regex.length) for (var i=0, n=regex.length; i<n; i++) {
			m = regex[i].exec(text);
			if (m) break;
		}
		else m = regex.exec(text);
		if (!m) return false;
		foundMatch = true; // NOTE foundMatch is set false at start of parsing loop
		if (fn) fn(m);
		state = nextState;
		text = text.substr(m[0].length);
		return true;
	}

	do {
		foundMatch = false;
		switch (state) {
			case 0:
				test(/^\s*/, 1);
		
			case 1:
				// Element / Universal
				test(/^(\*|[a-zA-Z0-9_]+)(\|(\*|[a-zA-Z0-9_-]+))?/, 2, function(m) {
					var ns, name = m[1], c;
					if (m[3]) {	ns = m[1]; name = m[3];	}
					c = createNodeTestCondition(name, ns);
					mergeCondition(c);
				});
		
			case 2:
				// ID
				test(/^#([a-zA-Z0-9_-]+)/, 2, function(m) {
					var c = createIdCondition(m[1]);
					mergeCondition(c);
				});
	
				// Class
				test(/^\.([a-zA-Z0-9_-]*)/, 2, function(m) {
					var c = createClassCondition(m[1]);
					mergeCondition(c);
				});
	
				// Attribute
				test(/^\[\s*([a-z0-9_-]+)(\|([a-z0-9_-]+))?\s*(([~|^$*]?=)\s*("([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]/, 2, function(m) {
					var ns = null, name = m[1], value, type = ATTRIBUTE_CONDITION, specified = false, c;
					if (m[3]) { ns = m[1]; name = m[3]; }
					if (m[4]) {
						type = ({
							"~=": ONE_OF_ATTRIBUTE_CONDITION,
							"|=": BEGIN_HYPHEN_ATTRIBUTE_CONDITION,
							"^=": STARTS_WITH_ATTRIBUTE_CONDITION,
							"$=": ENDS_WITH_ATTRIBUTE_CONDITION,
							"*=": CONTAINS_ATTRIBUTE_CONDITION,
							"=": ATTRIBUTE_CONDITION
						})[m[5]];
						specified = true;
						value = m[7] || m[8] || m[9];
					}
					c = createAttributeCondition(name, ns, specified, value, type);	
					mergeCondition(c);
				});
				
				test(/^:not\(\s*/, 1, function(m) {
					invert = true;
				});
				
				// Pseudo-element. FIXME
				test([ /^::([a-zA-Z_-]+)/, /^:(first-line|first-letter|before|after)/ ], 3, function(m) {
					var c = createPseudoElementCondition(m[1]);
					mergeCondition(c);
				});
				
				// Pseudo-class.  FIXME
				test(/^:([a-zA-Z_-]+)(?:\(([^)]*)\))?/, 2, function(m) {
					var c = createPseudoClassCondition(m[1], m[2]);
					mergeCondition(c);
				});
				
			case 3:
				// Selector grouping
				if (test(/^\s*,/, 0, function(m) {
					selector.steps.push(relSelector);
					selectorList.push(selector);

					relSelector = new RelativeSelector();
					relSelector.relationType = DESCENDANT_RELATIVE;
					selector = new Selector();
				}) ) break;
		
			case 4:
				// Combinators
				test(/^\s*([\s>~+])/, 0, function(m) {
					selector.steps.push(relSelector);

					relSelector = new RelativeSelector();
					relSelector.relationType = ({
						">": CHILD_RELATIVE,
						"~": INDIRECT_ADJACENT_RELATIVE,
						"+": DIRECT_ADJACENT_RELATIVE
					})[m[1]] || DESCENDANT_RELATIVE;
				});
				
				break;
		}
		
		if (invert) { // FIXME :not() has several failure modes in this implementation
			if ( !test(/^\s*\)/, 2, function(m) {
				currentCondition.negativeCondition = true;
			}) ) throw "Selector parsing failed in :not() at " + text;
		}
		
	} while (text.length && foundMatch);
	
	selector.steps.push(relSelector);
	selectorList.push(selector);
	
	return selectorList;
}


/*
interface Selector {
	RelativeSelector steps[];
}
*/
var Selector = function() {
	this.steps = [];
}

extend(Selector, {
	
getSpecificity: function(selector) {
	var idCount = 0, classCount = 0, typeCount = 0;
	forEach(selector.steps, function(step) {
		forEach(step.conditions, function(condition) {
			switch (condition.conditionType) {
				case NODE_TEST_CONDITION:
					if (/* Node.ELEMENT_NODE */ 1 == condition.nodeType && condition.localName && "*" != condition.localName) typeCount++;
					break;
				case ID_CONDITION:
					idCount++;
					break;
				case PSEUDO_ELEMENT_CONDITION:
				case PSEUDO_CLASS_CONDITION:
					break;
				default: // Attribute conditions
					classCount++;
					break;
			}
		});
	});
	return [idCount, classCount, typeCount];
},

cmpSpecificity: function(s1, s2) {
	var c1 = Selector.getSpecificity(s1), c2 = Selector.getSpecificity(c2);
	for (var n=c1.length, i=0; i<n; i++) {
		var a = c1[i], b = c2[i];
		if (a > b) return 1;
		if (a < b) return -1;
	}
	return 0;
}

});

// Selector.prototype.test contains the bottle-neck for matchesSelector performance.
// It has been optimized by bringing tagName test inside the function
// FIXME the tagName test doesn't handle namespaces
Selector.prototype.test = function(element) {
	var curElt = element;
	var rel = 0;
	var i = this.steps.length - 1;
	do {
		var step = this.steps[i];
		switch (rel) {
			case 0: // first time through there is no relationType
				if (!step.test(curElt)) return false;
				break;
			case 1: // DESCENDANT_RELATIVE:
				do { // keep trying ancestors unless already at top of tree
					curElt = curElt.parentNode;
					if (!curElt || curElt.nodeType == 9 /* Node.DOCUMENT_NODE */) return false;
				} while (!step.test(curElt));
				break;
			case 2: // CHILD_RELATIVE:
				curElt = curElt.parentNode;
				if (!curElt || curElt.nodeType == 9 /* Node.DOCUMENT_NODE */) return false;
				if (!step.test(curElt)) return false;
				break;
			case 3: // DIRECT_ADJACENT_RELATIVE:
				do {
					curElt = curElt.previousSibling;
					if (!curElt) return false;
				} while (curElt.nodeType != 1 /* Node.ELEMENT_NODE */);
				if (!step.test(curElt)) return false;
				break;
			case 4: // INDIRECT_ADJACENT_RELATIVE:
				do {
					curElt = curElt.previousSibling;
					if (!curElt) return false;
				} while (curElt.nodeType != 1 /* Node.ELEMENT_NODE */ || !step.test(curElt));
				break;
		}
		rel = step.relationType;
	} while (i--);
	return true;
}


/*
interface RelativeSelector {
	int relationType;
	Condition conditions[];
}
*/
var RelativeSelector = function() {
	this.relationType = 0;
	this.conditions = [];
}
var NO_RELATIVE = 0;
var DESCENDANT_RELATIVE = 1;
var CHILD_RELATIVE = 2;
var DIRECT_ADJACENT_RELATIVE = 3;
var INDIRECT_ADJACENT_RELATIVE = 4;

RelativeSelector.prototype.test = function(element) {
	var n = this.conditions.length;
	var i=n;
	do {
		var rc = this.conditions[n-i].test(element);
		if (!rc) return false;
	} while (--i);
	return true;
}


/*
interface Condition {
	int conditionType;
	int nodeType;
	boolean negativeCondition;
}
*/
var Condition = function() {}
var NODE_TEST_CONDITION = 1;
var ID_CONDITION = 2;
var CLASS_CONDITION = 3;
var PSEUDO_ELEMENT_CONDITION = 4;
var ATTRIBUTE_CONDITION = 5;
var ONE_OF_ATTRIBUTE_CONDITION = 6;
var BEGIN_HYPHEN_ATTRIBUTE_CONDITION = 7;
var STARTS_WITH_ATTRIBUTE_CONDITION = 8;
var ENDS_WITH_ATTRIBUTE_CONDITION = 9;
var CONTAINS_ATTRIBUTE_CONDITION = 10;
var PSEUDO_CLASS_CONDITION = 11;
/* 
var ONLY_CHILD_CONDITION = 12;
var ONLY_TYPE_CONDITION = 13;
var POSITIONAL_CONDITION = 14;
var LANG_CONDITION = 15;
var IS_ROOT_CONDITION = 16;
var IS_EMPTY_CONDITION = 17;
*/

function createNodeTestCondition(name, ns) {
	var c = new Condition();
	c.conditionType = NODE_TEST_CONDITION;
	c.nodeType = 1 /* Node.ELEMENT_NODE */;
	c.localName = name;
	c.namespaceURI = ns;
	return c;
}

function createIdCondition(value) {
	var c = new Condition();
	c.conditionType = ID_CONDITION;
	c.value = value;
	return c;
}

function createClassCondition(value) {
	var c = new Condition();
	c.conditionType = CLASS_CONDITION;
	c.value = value;
	return c;
}

function createAttributeCondition(name, ns, specified, value, conditionType) {
	var c = new Condition();
	c.conditionType = conditionType || ATTRIBUTE_CONDITION;
	c.localName = name;
	c.namespaceURI = ns;
	c.specified = specified;
	c.value = value;
	return c;
}

function createPseudoClassCondition(type, value) {
	var c = new Condition();
	c.conditionType = PSEUDO_CLASS_CONDITION;
	c.pseudoClass = type;
	c.value = value;
	return c;
}

function createPseudoElementCondition(type) {
	var c = new Condition();
	c.conditionType = PSEUDO_ELEMENT_CONDITION;
	c.pseudoElement = type;
	return c;
}

Condition.prototype.test = function(element) { // TODO namespace handling
	var attrValue;
	var success = !this.negativeCondition;
	var failure = !success;
	switch (this.conditionType) {
		case NODE_TEST_CONDITION:
			if (/* Node.ELEMENT_NODE */ 1 != this.nodeType) return false; // TODO should we allow tests for other node types?
			if (!this.localName || "*" == this.localName) return success;
			if (element.tagName == this.localName.toUpperCase()) return success; // FIXME assumes HTML
			return failure;
			break;
		case ID_CONDITION:
			attrValue = element.id;
			if (attrValue == this.value) return success;
			return failure;
			break;
		case CLASS_CONDITION:
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp(" "+this.value+" ");
				this.regex = regex;
			}
			var attrValue = element.className;
			if (regex.test(" "+attrValue+" ")) return success;
			return failure;
			break;
		case ATTRIBUTE_CONDITION:
		case ONE_OF_ATTRIBUTE_CONDITION:
		case BEGIN_HYPHEN_ATTRIBUTE_CONDITION:
		case STARTS_WITH_ATTRIBUTE_CONDITION:
		case ENDS_WITH_ATTRIBUTE_CONDITION:
		case CONTAINS_ATTRIBUTE_CONDITION:
			return this.testAttributeCondition(element);
			break;
		case PSEUDO_CLASS_CONDITION:
		case PSEUDO_ELEMENT_CONDITION:
			throw "Unsupported condition " + this.conditionType;
			break;
	}
	throw "Error in Condition.test()"; 
}

Condition.prototype.testAttributeCondition = function(element) {
	var success = !this.negativeCondition;
	var failure = !success;
	var attrName = this.localName;
	attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
	if (attrValue == null) return failure;
	var regex = this.regex;
	if (!regex) {
		switch (this.conditionType) {
		case ATTRIBUTE_CONDITION: // WARN this case *always* returns
			if (!this.specified) return success;
			if (attrValue == this.value) return success;
			return failure;
			break;
		case ONE_OF_ATTRIBUTE_CONDITION:
			regex = new RegExp("(?:^|\\s)"+this.value+"(?:$|\\s)");
			break;
		case BEGIN_HYPHEN_ATTRIBUTE_CONDITION:
			regex = new RegExp("^"+this.value+"(?:$|-)");
			break;
		case STARTS_WITH_ATTRIBUTE_CONDITION:
			regex = new RegExp("^"+this.value);
			break;
		case ENDS_WITH_ATTRIBUTE_CONDITION:
			regex = new RegExp(this.value+"$");
			break;
		case CONTAINS_ATTRIBUTE_CONDITION:
			regex = new RegExp(this.value);
			break;
		}
		this.regex = regex;
	}
	
	if (regex.test(attrValue)) return success;
	return failure;
}


// FIXME querySelector* should capture errors and rethrow as DOM Exceptions

function querySelector(node, selectorText) {
	if (null == selectorText) return false;
	return getElementsBySelector(node, selectorText, true);
}
function querySelectorAll(node, selectorText) {
	if (null == selectorText) return false;
	return getElementsBySelector(node, selectorText, false);
}
function matchesSelector(node, selectorText) {
	if (null == selectorText) return false;
	var selectorList = getSelector(selectorText);
	if (!selectorList) return false;
	for (var j=0, selector; selector=selectorList[j]; j++) {
		if (selector.test(node)) return true;
	}
	return false;
}


var selectors = {};
var elementsByTagName = {};

function getSelector(selectorText) {
	var selectorList = selectors[selectorText];
	if (!selectorList) {
		selectorList = parseSelectors(selectorText);
		selectors[selectorText] = selectorList;
	}
	return selectorList;
}

function getElementsBySelector(scope, selectorText, single) { // TODO namespaces??
	if (null == selectorText) return false;
	var selectorList = getSelector(selectorText);
	var nodeList = [];
	nodeList.item = function(index) { return this[index]; }
	if (!selectorList) return (single) ? null : nodeList;
	
	var doc = scope.documentElement ? scope : scope.ownerDocument;
	
	// First up check for ID selectors which result in instant evaluation
	var id = selectorList.id;
	if (id == null) id = getId(selectorList); 
	if (id) { // correlates to a single selector in the list
		var el = doc.getElementById(id);
		if (contains(scope, el)) {
			if (selectorList[0].test(el)) return (single) ? el : [ el ];
			else return (single) ? null : nodeList;
		}
		else return (single) ? null : nodeList;
	}
	
	// check if there is a unified ancestor ID which is also contained by scope
	// The expectation is that this is the alternate for :scope
	var ancestorId = selectorList.ancestorId;
	if (ancestorId == null) ancestorId = getAncestorId(selectorList);
	if (ancestorId) {
		var el = doc.getElementById(ancestorId);
		if (!el) return (single) ? null : nodeList;
		if (contains(scope, el)) scope = el; // FIXME IE
	}
	
	// check if there is one className we are searching for
	var className = selectorList.className;
	if (className == null) className = getClassNameText(selectorList);

	// check if there is one element type we are searching for
	var tagName = selectorList.tagName;
	if (tagName == null) tagName = getTagName(selectorList);

	// TODO test whether it is faster to use getElementsByClassName or getElementsByTagName
	var descendants = ("*" == tagName && "" != className && scope.getElementsByClassName) ?
			scope.getElementsByClassName(className) :
			scope.getElementsByTagName(tagName);
	for (var i=0, current; current=descendants[i]; i++) {
		for (var j=0, selector; selector=selectorList[j]; j++) {
			if (selector.test(current)) {
				if (single) return current;
				nodeList.push(current);
				break;
			}
		}
	}
	return (single) ? null : nodeList;
}

function getId(selectorList) {
	var id = selectorList.id; // selectorList.id is set to false if not applicable
	if (id == null) { // not checked yet, so do that now
		if (selectorList.length == 1) {
			var selector = selectorList[0];
			id = getSelectorId(selector);
			selectorList.id = (id) ? id : false;
		}
		else selectorList.id = false;
	}
	return selectorList.id;
}
function getSelectorId(selector) {
	var steps = selector.steps;
	var step = steps[steps.length-1];
	for (var j=0, cond; cond=step.conditions[j]; j++) {
		if (cond.conditionType == ID_CONDITION) return cond.value;
	}
	return null;
}

function getAncestorId(selectorList) {
	var ancestorId = selectorList.ancestorId;
	if (ancestorId == null) {
		for (var j=0, selector; selector=selectorList[j]; j++) {
			var id = getSelectorAncestorId(selector);
			if (!id) { // if any selector lacks an ancestorId then ignore them all
				ancestorId = false; break;
			}
			if (!ancestorId) { ancestorId = id; continue; }
			if (ancestorId == id) continue;
			ancestorId = false; break;
		}
		selectorList.ancestorId = ancestorId;
	}
	return selectorList.ancestorId;
}
function getSelectorAncestorId(selector) {
	var steps = selector.steps;
	for (var i=steps.length-2, step; step=steps[i]; i--) {
		var conditions = step.conditions;
		var relType = steps[i+1].relationType;
		for (var j=0, cond; cond=conditions[j]; j++) {
			if (cond.conditionType == ID_CONDITION && 
				(relType == CHILD_RELATIVE || relType == DESCENDANT_RELATIVE)
				) return cond.value;
		}
	}
}

function getClassNameText(selectorList) {
	var text = selectorList.className;
	if (text == null) {
		var table = getSelectorClassNameTable(selectorList[0]);
		for (var j=1, selector; selector=selectorList[j]; j++) {
			var nextTable = getSelectorClassNameTable(selector);
			for (var className in table) {
				if (!nextTable[className]) delete table[className];
			}
		}
		var text = "";
		for (var className in table) {
			if (text != "") text += " ";
			text += className;
		}
		selectorList.className = text;
	}
	return selectorList.className;
}

function getSelectorClassNameTable(selector) {
	var steps = selector.steps; // FIXME don't want to access internal data directly. Should be an API cal
	var conditions = steps[steps.length-1].conditions;
	var table = {};
	for (var i=0, cond; cond=conditions[i]; i++) {
		if (cond.conditionType == CLASS_CONDITION) {
			var className = cond.value;
			if (!table[className]) table[className] = true;
		}
	}
	return table;
}

function getTagName(selectorList) {
	var tagName = selectorList.tagName; // selectorList.tagName is set to "*" if not applicable
	if (tagName == null) {
		for (var j=0, selector; selector=selectorList[j]; j++) {
			var selectorTagName = getSelectorTagName(selector);
			if (!selectorTagName || selectorTagName == "*") { tagName = "*"; break; }
			if (j == 0) { tagName = selectorTagName; continue; }
			if (j > 0 && selectorTagName == tagName) continue;
			tagName = "*"; break; // shouldn't reach here
		}
		selectorList.tagName = tagName;
	}
	return selectorList.tagName;
}
function getSelectorTagName(selector) {
	var steps = selector.steps; // FIXME don't want to access internal data directly. Should be an API cal
	var nodeTest = steps[steps.length-1].conditions[0];
	if (nodeTest.conditionType == NODE_TEST_CONDITION && nodeTest.nodeType == 1 /* Node.ELEMENT_NODE */) return nodeTest.localName;
	else return "*";
}

var contains = document.documentElement.contains ?
function(node, otherNode) {
	if (node === otherNode) return false;
	if (node.documentElement) node = node.documentElement;
	return node.contains(otherNode);
} :
function(node, otherNode) { return !!(node.compareDocumentPosition(otherNode) & 16); } // Node.DOCUMENT_POSITION_CONTAINED_BY


var DOM = Meeko.DOM;
DOM.$ = function(selector, node) {
	if (!node) node = document;
	return querySelector(node, selector);
}

DOM.$$ = function(selector, node) {
	if (!node) node = document;
	return querySelectorAll(node, selector);
}

DOM.match$ = function(element, selector) {
	return matchesSelector(element, selector);
}

function normalizeEvent(event) {
	event.target = event.srcElement;
	return event;
}

DOM.addEventListener = document.attachEvent && function(node, type, listener, capture) {
	if (capture) throw "Event capturing not supported on this browser";
	listener.normalize = normalizeEvent;
	return node.attachEvent('on' + type, listener);
}

DOM.removeEventListener = document.detachEvent && function(node, type, listener, capture) {
	return node.detachEvent('on' + type, listener);
}

})();


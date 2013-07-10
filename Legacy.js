/*!
Legacy.js
Copyright 2007, 2013 Sean Hogan (http://www.meekostuff.net/)
MIT License
*/

/*
This script patches DOMSprockets with element selector and event handling utils.
*/

if (!window.Meeko) window.Meeko = {};

/*
CSS Parser

This API and implementation is a Frankenstein of:
1. W3C Simple API for CSS
	http://www.w3.org/TR/SAC
	http://www.w3.org/Style/CSS/SAC/doc/org/w3c/css/sac/package-summary.html
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

if (!this.Meeko) this.Meeko = {};

Meeko.CSS = (function() {	

var _ = Meeko.stuff;

var Parser = function() {
	this.conditionFactory = _conditionFactory;
}

Parser.prototype.parseSelectors = function(text)
{
	var selectorList = this._parseSelectors(text);
	_.forEach(selectorList, function(selector) {
		selector.__refresh();
	});
	return selectorList;
}

Parser.prototype._parseSelectors = function(selectorText) { // TODO error handling
	var text = selectorText;

	var cf = this.conditionFactory;
	
	var selectorList = [];
	var selector = new Selector();
	var relSelector = new RelativeSelector();
	relSelector.relationType = RelativeSelector.DESCENDANT_RELATIVE;
	var ci = null; // current Condition

	function mergeCondition(c) {
		relSelector.addCondition(c);
	}

	var ns = null;
	var name = null;
	var invert = 0;

	var state = 0;

	do {
		var m = null;

		switch (state) {
			case 0:
				m = /^\s*/.exec(text);
				if (m) {
					state = 1;
					text = text.substr(m[0].length);
					break;
				}
				break;
		
			case 1:
				// Element / Universal
				m = /^(\*|[a-zA-Z0-9_]+)(\|(\*|[a-zA-Z0-9_-]+))?/.exec(text);
				if (m) {
					if (m[3]) {	ns = m[1]; name = m[3];	}
					else { ns = null; name = m[1]; }
					ci = cf.createNodeTestCondition(name, ns);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
		
			case 2:
				// ID
				m = /^#([a-zA-Z0-9_-]+)/.exec(text);
				if (m) {
					ci = cf.createIdCondition(m[1]);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
	
				// Class
				m = /^\.([a-zA-Z0-9_-]*)/.exec(text);
				if (m) {
					ci = cf.createClassCondition(null, m[1]);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
	
				// Attribute
				m = /^\[\s*([a-z0-9_-]+)(\|([a-z0-9_-]+))?\s*(([~|^$*]?=)\s*("([^"]*)"|'([^']*)'|([^\]\s]+))\s*)?\]/.exec(text);
				if (m) {
					if (m[3]) { ns = m[1]; name = m[3]; }
					else { ns = null; name = m[1]; }
					if (m[4]) {
						value = m[7] || m[8] || m[9];
						switch(m[5]) {
							case "~=": ci = cf.createOneOfAttributeCondition(name, ns, true, value); break;
							case "|=": ci = cf.createBeginHyphenAttributeCondition(name, ns, true, value); break;
							case "^=": ci = cf.createStartsWithAttributeCondition(name, ns, true, value); break;
							case "$=": ci = cf.createEndsWithAttributeCondition(name, ns, true, value); break;
							case "*=": ci = cf.createContainsAttributeCondition(name, ns, true, value); break;
							case "=": ci = cf.createAttributeCondition(name, ns, true, value); break;
						}
					}
					else {
						ci = cf.createAttributeCondition(name, ns, false, null);
					}
	
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
				
				// Pseudo-element. FIXME
				m = /^::([a-zA-Z_-]+)/.exec(text) ||
					/^:(first-line)/.exec(text) ||
					/^:(first-letter)/.exec(text) ||
					/^:(before)/.exec(text) ||
					/^:(after)/.exec(text);	
				if (m) {
					ci = cf.createPseudoElementCondition(m[1]);
					mergeCondition(ci);
					state = 3;
					text = text.substr(m[0].length);
					break;
				}
				
				// Only-child. FIXME
				m = /^:only-(child|of-type)/.exec(text);
				if (m) {
					var same_type = ("of-type" === m[1]);
					ci = (same_type) ? cf.createOnlyTypeCondition() : cf.createOnlyChildCondition();
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
				
				// Positionals
				m = /^:first-(child|of-type)/.exec(text);
				if (m) {
					var same_type = ("of-type" === m[1]);
					var a = 0, b = 0;
					ci = cf.createPositionalCondition([a, b], same_type, true);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
				
				m = /^:nth-(child|of-type)\(/.exec(text);
				if (m) {
					var same_type = ("of-type" === m[1]);
					text = text.substr(m[0].length);
					m = /^\s*(odd|even)\s*\)/.exec(text); // TODO an+b
					var a = 0, b = 0;
					switch (m[1]) {
						case "even": a = 2; b = 2; break;
						case "odd": a = 2; b = 1; break;
					}
					ci = cf.createPositionalCondition([a, b], same_type, true);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}

				m = /^:not\(\s*/.exec(text);
				if (m) {
					state = 1;
					invert = 2;
					text = text.substr(m[0].length);
					break;
				}
				
				// Pseudo-class.  FIXME
				m = /^:([a-zA-Z_-]+)/.exec(text);
				if (m) {
					ci = cf.createPseudoClassCondition(null, m[1]);
					mergeCondition(ci);
					state = 2;
					text = text.substr(m[0].length);
					break;
				}
				
			case 3:
				// Selector grouping
				m = /^\s*,/.exec(text);
				if (m) {
					selector.addStep(relSelector);
					selectorList.push(selector);

					relSelector = new RelativeSelector();
					relSelector.relationType = RelativeSelector.DESCENDANT_RELATIVE;
					selector = new Selector();

					state = 0;
					text = text.substr(m[0].length);
					break;
				}
		
			case 4:
				// Combinators
				m = /^\s*([\s>~+])/.exec(text);
				if (m) {
					selector.addStep(relSelector);

					relSelector = new RelativeSelector();
					switch (m[1]) {
						case ">": relSelector.relationType = RelativeSelector.CHILD_RELATIVE; break;
						case "~": relSelector.relationType = RelativeSelector.INDIRECT_ADJACENT_RELATIVE; break;
						case "+": relSelector.relationType = RelativeSelector.DIRECT_ADJACENT_RELATIVE; break;
						default /* case "\s" */: relSelector.relationType = RelativeSelector.DESCENDANT_RELATIVE; break;
					}
					
					state = 0;
					text = text.substr(m[0].length);
					break;
				}
				
				break;
		}
		
		if (invert > 0 && invert-- === 1) {
			m = /^\s*\)/.exec(text);
			if (m) {
				ci.negativeCondition = true;
				state = 2;
				text = text.substr(m[0].length);
			}
			else throw ":not() failed";
		}
		
	} while (text.length && m);
	
	selector.addStep(relSelector);
	selectorList.push(selector);
	
	return selectorList;
}


// FIXME how to implement SelectorList magic?
var SelectorList = function() {}
SelectorList.prototype.addSelector = function(selector) {
	this.push(selector);
}

SelectorList.prototype.test = function(element) {
	var n = this.length;
	for (var i=0; i<n; i++) {
		var selector = this[i];
		var rc = selector.test(element);
		if (rc) return true;
	}
	return false;
}


/*
interface Selector {
	RelativeSelector steps[];
	Specificity specifity;
}
*/
var Selector = function() {
	this.steps = [];
	this.specificity = new Specificity();
}

Selector.prototype.__refresh = function() {
	this.specificity = Selector.__get_specificity(this);
}

Selector.__get_specificity = function(selector) {
	var aCount = 0, bCount = 0, cCount = 0;
	_.forEach(selector.steps, function(step) {
		_.forEach(step.conditions, function(condition) {
			switch (condition.conditionType) {
				case Condition.NODE_TEST_CONDITION:
					if (/* Node.ELEMENT_NODE */ 1 == condition.nodeType && condition.localName && "*" != condition.localName) cCount++;
					break;
				case Condition.ID_CONDITION:
					aCount++;
					break;
				case Condition.PSEUDO_ELEMENT_CONDITION:
					break;
				default:
					bCount++;
					break;
			}
		});
	});
	return new Specificity(aCount, bCount, cCount);
}

Selector.prototype.addStep = function(step) {
	if (step instanceof RelativeSelector) this.steps.push(step);
	else throw "Error in Selector.addStep";
}

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
interface Specificity {
	int aCount;
	int bCount;
	int cCount;
}
*/
var Specificity = function(a,b,c) {
	this.aCount = a || 0;
	this.bCount = b || 0;
	this.cCount = c || 0;
}

Specificity.cmp = function(first, second) {
	if (first.aCount > second.aCount) return 1;
	if (first.aCount < second.aCount) return -1;
	if (first.bCount > second.bCount) return 1;
	if (first.bCount < second.bCount) return -1;
	if (first.cCount > second.cCount) return 1;
	if (first.cCount < second.cCount) return -1;
	return 0;
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
RelativeSelector.NO_RELATIVE = 0;
RelativeSelector.DESCENDANT_RELATIVE = 1;
RelativeSelector.CHILD_RELATIVE = 2;
RelativeSelector.DIRECT_ADJACENT_RELATIVE = 3;
RelativeSelector.INDIRECT_ADJACENT_RELATIVE = 4;

RelativeSelector.prototype.addCondition = function(condition) {
	if (condition instanceof Condition) this.conditions.push(condition);
	else throw "Error in RelativeSelector.addCondition";
}

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
Condition.NODE_TEST_CONDITION = 1;
Condition.ID_CONDITION = 2;
Condition.CLASS_CONDITION = 3;
Condition.PSEUDO_ELEMENT_CONDITION = 4;
Condition.ATTRIBUTE_CONDITION = 5;
Condition.ONE_OF_ATTRIBUTE_CONDITION = 6;
Condition.BEGIN_HYPHEN_ATTRIBUTE_CONDITION = 7;
Condition.STARTS_WITH_ATTRIBUTE_CONDITION = 8;
Condition.ENDS_WITH_ATTRIBUTE_CONDITION = 9;
Condition.CONTAINS_ATTRIBUTE_CONDITION = 10;
Condition.LANG_CONDITION = 11;
Condition.ONLY_CHILD_CONDITION = 12;
Condition.ONLY_TYPE_CONDITION = 13;
Condition.POSITIONAL_CONDITION = 14;
Condition.PSEUDO_CLASS_CONDITION = 15;
Condition.IS_ROOT_CONDITION = 16;
Condition.IS_EMPTY_CONDITION = 17;


Condition.prototype.test = function(element) { // TODO namespace handling
	var attrValue;
	var success = !this.negativeCondition;
	var failure = !success;
	switch (this.conditionType) {
		case Condition.NODE_TEST_CONDITION:
			if (/* Node.ELEMENT_NODE */ 1 != this.nodeType) return false; // TODO should we allow tests for other node types?
			if (!this.localName || "*" == this.localName) return success;
			if (element.tagName == this.localName.toUpperCase()) return success; // FIXME assumes HTML
			return failure;
			break;
		case Condition.ID_CONDITION:
			attrValue = element.id;
			if (attrValue == this.value) return success;
			return failure;
			break;
		case Condition.CLASS_CONDITION:
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp(" "+this.value+" ");
				this.regex = regex;
			}
			var attrValue = element.className;
			if (regex.test(" "+attrValue+" ")) return success;
			return failure;
			break;
		case Condition.PSEUDO_CLASS_CONDITION: // TODO
			break;
		case Condition.PSEUDO_ELEMENT_CONDITION: // TODO
			break;
		case Condition.LANG_CONDITION: // TODO
			break;
		case Condition.ONLY_CHILD_CONDITION: // TODO
			break;
		case Condition.ONLY_TYPE_CONDITION: // TODO
			break;
		case Condition.POSITIONAL_CONDITION:
			var tagName = element.tagName.toLowerCase();
			var sameType = this.sameType;
			var count = 1;
			for (var node=element.previousSibling; node; node=node.previousSibling) {
				if (node.nodeType != 1 || sameType && tagName !== node.tagName.toLowerCase()) continue;
				count++;
			}
			return ( (count - this.position[1]) % this.position[0] === 0);
			break;
		case Condition.IS_ROOT_CONDITION:
			if (element.parentNode.nodeType == 9 /* Node.DOCUMENT_NODE */) return success;
			return failure;
			break;
		case Condition.IS_EMPTY_CONDITION: // FIXME does this fulfil the spec?
			if (0 == element.childNodes.length) return success;
			return failure;
			break;
		case Condition.ATTRIBUTE_CONDITION: // TODO consolidate all attribute checks
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			if (attrValue == null) return failure;
			if (attrValue == "") return failure; // FIXME is this acceptable??
			if (!this.specified) return success;
			if (attrValue == this.value) return success;
			return failure;
			break;
		case Condition.ONE_OF_ATTRIBUTE_CONDITION:
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp(" "+this.value+" ");
				this.regex = regex;
			}
			if (regex.test(" "+attrValue+" ")) return success;
			return failure;
			break;
		case Condition.BEGIN_HYPHEN_ATTRIBUTE_CONDITION:
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			if (attrValue == this.value) return success;
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp("^"+this.value+"-");
				this.regex = regex;
			}
			if (regex.test(" "+attrValue+" ")) return success;
			return failure;
			break;
		case Condition.STARTS_WITH_ATTRIBUTE_CONDITION:
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp("^"+this.value);
				this.regex = regex;
			}
			if (regex.test(attrValue)) return success;
			return failure;
			break;
		case Condition.ENDS_WITH_ATTRIBUTE_CONDITION:
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp(this.value+"$");
				this.regex = regex;
			}
			if (regex.test(attrValue)) return success;
			return failure;
			break;
		case Condition.CONTAINS_ATTRIBUTE_CONDITION:
			var attrName = this.localName;
			attrValue = (attrName != "class") ? element.getAttribute(attrName) : element.className;
			var regex = this.regex;
			if (!regex) {
				regex = new RegExp(this.value);
				this.regex = regex;
			}
			if (regex.test(attrValue)) return success;
			return failure;
			break;	
	}
	throw "Error in Condition.test()"; 
}


var _conditionFactory = {

	createNodeTestCondition: function(name, ns) {
		var c = new Condition();
		c.conditionType = Condition.NODE_TEST_CONDITION;
		c.nodeType = 1 /* Node.ELEMENT_NODE */;
		c.localName = name;
		c.namespaceURI = ns;
		return c;
	},
	
	createIdCondition: function(value) {
		var c = new Condition();
		c.conditionType = Condition.ID_CONDITION;
		c.value = value;
		return c;
	},

	createClassCondition: function(ns, value) {
		var c = new Condition();
		c.conditionType = Condition.CLASS_CONDITION;
		c.namespaceURI = ns; // TODO is this relavent?
		c.value = value;
		return c;
	},

	createAttributeCondition: function(name, ns, specified, value, conditionType) {
		var c = new Condition();
		c.conditionType = conditionType || Condition.ATTRIBUTE_CONDITION;
		c.localName = name;
		c.namespaceURI = ns;
		c.specified = specified;
		c.value = value;
		return c;
	},

	createBeginHyphenAttributeCondition: function(name, ns, specified, value) {
		return this.createAttributeCondition(name, ns, specified, value, Condition.BEGIN_HYPHEN_ATTRIBUTE_CONDITION);
	},

	createOneOfAttributeCondition: function(name, ns, specified, value) {
		return this.createAttributeCondition(name, ns, specified, value, Condition.ONE_OF_ATTRIBUTE_CONDITION);
	},

	createStartsWithAttributeCondition: function(name, ns, specified, value) {
		return this.createAttributeCondition(name, ns, specified, value, Condition.STARTS_WITH_ATTRIBUTE_CONDITION);
	},

	createEndsWithAttributeCondition: function(name, ns, specified, value) {
		return this.createAttributeCondition(name, ns, specified, value, Condition.ENDS_WITH_ATTRIBUTE_CONDITION);
	},

	createContainsAttributeCondition: function(name, ns, specified, value) {
		return this.createAttributeCondition(name, ns, specified, value, Condition.CONTAINS_ATTRIBUTE_CONDITION);
	},

	createOnlyChildCondition: function() {
		// TODO
	},

	createPositionalCondition: function(position, same_type) {
		var c = new Condition();
		c.conditionType = Condition.POSITIONAL_CONDITION;
		c.position = position.slice(0);
		c.sameType = same_type;
		return c;
	},

	createPseudoClassCondition: function(ns, value) {
		// TODO
	}
	
}



return {
	Parser: Parser,
	SelectorList: SelectorList,
	Selector: Selector,
	Specificity: Specificity,
	RelativeSelector: RelativeSelector,
	Condition: Condition
}


})();


// FIXME querySelector* should capture errors and rethrow as DOM Exceptions

if (!Meeko.DOM) Meeko.DOM = {};

Meeko.stuff.extend(Meeko.DOM, new function() {

var NodeSelector = function(target) {
	if (target.querySelector) return target;
	if (target.nodeType == null) throw "Target does not have NodeSelector interface";
	if (!(this instanceof NodeSelector)) return new NodeSelector(target);
	this._target = target;
}
NodeSelector.querySelector = function(target, selectorText) { return NodeSelector(target).querySelector(selectorText); }
NodeSelector.querySelectorAll = function(target, selectorText) { return NodeSelector(target).querySelectorAll(selectorText); }
NodeSelector.prototype.querySelector = function(selectorText) {
	var target = this._target || this;
	if (null == selectorText) return false;
	return getElementsBySelector(target, selectorText, true);
}
NodeSelector.prototype.querySelectorAll = function(selectorText) {
	var target = this._target || this;
	if (null == selectorText) return false;
	return getElementsBySelector(target, selectorText, false);
}
var ElementSelector = function(target) {
	if (target.matchesSelector) return target;
	if (target.nodeType !== 1) throw "Target does not have ElementSelector interface";
	if (!(this instanceof ElementSelector)) return new ElementSelector(target);
	this._target = target;
}
ElementSelector.querySelector = function(target, selectorText) { return ElementSelector(target).querySelector(selectorText); }
ElementSelector.querySelectorAll = function(target, selectorText) { return ElementSelector(target).querySelectorAll(selectorText); }
ElementSelector.matchesSelector = function(target, selectorText) { return ElementSelector(target).matchesSelector(selectorText); }
ElementSelector.prototype.querySelector = NodeSelector.prototype.querySelector;
ElementSelector.prototype.querySelectorAll = NodeSelector.prototype.querySelectorAll;
ElementSelector.prototype.matchesSelector = function(selectorText) {
	var target = this._target || this;
	if (null == selectorText) return false;
	var selectorList = getSelector(selectorText);
	if (!selectorList) return false;
	for (var j=0, selector; selector=selectorList[j]; j++) {
		if (selector.test(target)) return true;
	}
	return false;
}

var CSS = Meeko.CSS;
var Relative = CSS.RelativeSelector;
var Condition = CSS.Condition;
var cssParser = new CSS.Parser();
var selectors = {};
var elementsByTagName = {};

function getSelector(selectorText) {
	var selectorList = selectors[selectorText];
	if (!selectorList) {
		selectorList = cssParser.parseSelectors(selectorText);
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
	
	// First up check for ID selectors which result in instant evaluation
	var id = selectorList.id;
	if (id == null) id = getId(selectorList); 
	if (id) { // correlates to a single selector in the list
		var el = document.getElementById(id);
		if (scope !== el && contains(scope, el)) { // FIXME IE
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
		var el = document.getElementById(ancestorId);
		if (!el) return (single) ? null : nodeList;
		if (scope !== el && contains(scope, el)) scope = el; // FIXME IE
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
		if (cond.conditionType == Condition.ID_CONDITION) return cond.value;
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
			if (cond.conditionType == Condition.ID_CONDITION && 
				(relType == Relative.CHILD_RELATIVE || relType == Relative.DESCENDANT_RELATIVE)
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
		if (cond.conditionType == Condition.CLASS_CONDITION) {
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
	if (nodeTest.conditionType == Condition.NODE_TEST_CONDITION && nodeTest.nodeType == 1 /* Node.ELEMENT_NODE */) return nodeTest.localName;
	else return "*";
}

var contains = document.documentElement.contains ?
function(node, otherNode) { return node.contains(otherNode); } :
function(node, otherNode) { return node === otherNode || !!(node.compareDocumentPosition(otherNode) & 16); } // Node.DOCUMENT_POSITION_CONTAINED_BY

return {
	NodeSelector: NodeSelector,
	ElementSelector: ElementSelector,
	Document: NodeSelector,
	Element: ElementSelector
};

}

);


(function() {
	
var DOM = Meeko.DOM;
DOM.$$ = function(selector, node) {
	if (!node) node = document;
	var Selector = (node === document) ? DOM.NodeSelector : DOM.ElementSelector;
	return Selector.querySelectorAll(node, selector);
}

DOM.match$ = function(element, selector) {
	return DOM.ElementSelector.matchesSelector(element, selector);
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


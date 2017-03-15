(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory) /* global define */
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.Moo = factory()
  }
}(this, function() {
  'use strict';

  var hasOwnProperty = Object.prototype.hasOwnProperty
  var toString = Object.prototype.toString

  // https://tc39.github.io/ecma262/#sec-tointeger
  function ToInteger(argument) {
    var number = Number(argument)
    if (number !== number) return 0
    return number < 0 ? Math.ceil(number) : Math.floor(number)
  }
  // https://tc39.github.io/ecma262/#sec-tolength
  function ToLength(argument) {
    var len = ToInteger(argument)
    return len <= 0 ? 0 : len >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : len
  }

  if (typeof Array.isArray === 'undefined') {
    // https://tc39.github.io/ecma262/#sec-isarray
    Array.isArray = function(object) {
      return toString.call(object) === '[object Array]'
    }
  }
  if (typeof Number.MAX_SAFE_INTEGER === 'undefined') {
    // https://tc39.github.io/ecma262/#sec-number.max_safe_integer
    Number.MAX_SAFE_INTEGER = 9007199254740991
  }
  if (typeof Array.prototype.map === 'undefined') {
    // https://tc39.github.io/ecma262/#sec-array.prototype.map
    Array.prototype.map = function(callbackfn, thisArg) {
      if (this == null) {
        throw new TypeError('Cannot be called on null or undefined')
      }
      var O = Object(this)
      var len = ToLength(O.length)
      if (typeof callbackfn !== 'function') {
        throw new TypeError('Callback must be callable')
      }
      var A = Array(len)
      for (var k = 0; k < len; k++) {
        if (k in O) {
          A[k] = callbackfn.call(thisArg, O[k], k,O)
        }
      }
      return A
    }
  }
  if (typeof Object.getOwnPropertyNames === 'undefined') {
    // https://tc39.github.io/ecma262/#sec-getownpropertykeys
    Object.getOwnPropertyNames = function(target) {
      // only enumerable properties
      var keys = []
      for (var key in target) {
        if (hasOwnProperty.call(target, key)) {
          keys.push(key)
        }
      }
      return keys
    }
  }
  if (typeof Object.assign === 'undefined') {
    // https://tc39.github.io/ecma262/#sec-object.assign
    Object.assign = function(target, sources) {
      if (target == null) {
        throw new TypeError('Target cannot be null or undefined');
      }
      target = Object(target)

      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i]
        if (source == null) continue

        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key]
          }
        }
      }
      return target
    }
  }

  var hasSticky = typeof new RegExp().sticky === 'boolean'

  function isRegExp(o) { return o && o.constructor === RegExp }


  function reEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  function reGroups(s) {
    var re = new RegExp('|' + s)
    return re.exec('').length - 1
  }
  function reCapture(s) {
    return '(' + s + ')'
  }
  function reUnion(regexps) {
    var source =  regexps.map(function(s) {
      return "(?:" + s + ")"
    }).join('|')
    return "(?:" + source + ")"
  }


  function compareLength(a, b) {
    return b.length - a.length
  }

  function regexpOrLiteral(obj) {
    if (typeof obj === 'string') {
      return '(?:' + reEscape(obj) + ')'

    } else if (isRegExp(obj)) {
      // TODO: consider /u support
      if (obj.ignoreCase) { throw new Error('RegExp /i flag not allowed') }
      if (obj.global) { throw new Error('RegExp /g flag is implied') }
      if (obj.sticky) { throw new Error('RegExp /y flag is implied') }
      if (obj.multiline) { throw new Error('RegExp /m flag is implied') }
      return obj.source

    } else {
      throw new Error('not a pattern: ' + obj)
    }
  }

  function objectToRules(object) {
    var keys = Object.getOwnPropertyNames(object)
    var result = []
    for (var i=0; i<keys.length; i++) {
      var key = keys[i]
      result.push([key, object[key]])
    }
    return result
  }

  function ruleOptions(name, obj) {
    if (typeof obj !== 'object' || Array.isArray(obj) || isRegExp(obj)) {
      obj = { match: obj }
    }

    var options = Object.assign({
      name: name,
      lineBreaks: false,
      pop: false,
      next: null,
      push: null,
    }, obj)

    // convert to array
    if (!Array.isArray(options.match)) { options.match = [options.match] }
    return options
  }

  function sortRules(rules) {
    var result = []
    for (var i=0; i<rules.length; i++) {
      var rule = rules[i]

      // get options
      var options = ruleOptions(rule[0], rule[1])
      var match = options.match

      // sort literals by length to ensure longest match
      var capturingPatterns = []
      var patterns = []
      var literals = []
      for (var j=0; j<match.length; j++) {
        var obj = match[j]
        if (!isRegExp(obj)) literals.push(obj)
        else if (reGroups(obj.source) > 0) capturingPatterns.push(obj)
        else patterns.push(obj)
      }
      literals.sort(compareLength)

      // append regexps to the end
      options.match = literals.concat(patterns)
      if (options.match.length) {
        result.push(options)
      }

      // add each capturing regexp as a separate rule
      for (var j=0; j<capturingPatterns.length; j++) {
        result.push(Object.assign({}, options, {
          match: [capturingPatterns[j]],
        }))
      }
    }
    return result
  }

  function compileRules(rules, hasStates) {
    if (!Array.isArray(rules)) rules = objectToRules(rules)

    rules = sortRules(rules)

    var groups = []
    var parts = []
    for (var i=0; i<rules.length; i++) {
      var options = rules[i]
      groups.push(options)

      // convert to RegExp
      var pat = reUnion(options.match.map(regexpOrLiteral))

      // validate
      var regexp = new RegExp(pat)
      if (regexp.test("")) {
        throw new Error("RegExp matches empty string: " + regexp)
      }
      var groupCount = reGroups(pat)
      if (groupCount > 1) {
        throw new Error("RegExp has more than one capture group: " + regexp)
      }
      if (!hasStates && (options.pop || options.push || options.next)) {
        throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.name + "')")
      }

      // try and detect rules matching newlines
      if (!options.lineBreaks && regexp.test('\n')) {
        throw new Error('Rule should declare lineBreaks: ' + regexp)
      }

      // store regex
      var isCapture = !!groupCount
      if (!isCapture) pat = reCapture(pat)
      parts.push(pat)
    }

    var suffix = hasSticky ? '' : '|(?:)'
    var flags = hasSticky ? 'ym' : 'gm'
    var regexp = new RegExp(reUnion(parts) + suffix, flags)

    return {regexp: regexp, groups: groups}
  }

  function compile(rules) {
    var result = compileRules(rules)
    return new Lexer({start: result}, 'start')
  }

  function compileStates(states, start) {
    var keys = Object.getOwnPropertyNames(states)
    if (!start) start = keys[0]

    var map = Object.create(null)
    for (var i=0; i<keys.length; i++) {
      var key = keys[i]
      map[key] = compileRules(states[key], true)
    }

    for (var i=0; i<keys.length; i++) {
      var groups = map[keys[i]].groups
      for (var j=0; j<groups.length; j++) {
        var g = groups[i]
        var state = g && (g.push || g.next)
        if (state && !map[state]) {
          throw new Error("Missing state '" + state + "' (in token '" + g.name + "' of state '" + keys[i] + "')")
        }
      }
    }

    return new Lexer(map, start)
  }


  var Lexer = function(states, state) {
    this.states = states
    this.buffer = ''
    this.stack = []
    this.setState(state)
    this.reset()
  }

  Lexer.error = {
    name: 'ERRORTOKEN',
    lineBreaks: true,
  }

  Lexer.prototype.setState = function(state) {
    if (!state || this.state === state) return
    this.state = state
    var index = this.re ? this.re.lastIndex : 0
    var info = this.states[state]
    this.groups = info.groups
    this.re = info.regexp
    this.re.lastIndex = index
  }

  Lexer.prototype.popState = function() {
    this.setState(this.stack.pop())
  }

  Lexer.prototype.pushState = function(state) {
    this.stack.push(this.state)
    this.setState(state)
  }

  Lexer.prototype.eat = hasSticky ? function(re) {
    // assume re is /y
    return re.exec(this.buffer)
  } : function(re) {
    // assume re is /g
    var match = re.exec(this.buffer)
    // assert(match)
    // assert(match.index === 0)
    if (match[0].length === 0) {
      return null
    }
    return match
  }
  // TODO: try instead the |(?:) trick?

  function tokenToString() {
    return this.value || this.type
  }

  Lexer.prototype.lex = function() {
    var re = this.re
    var buffer = this.buffer

    if (re.lastIndex === buffer.length) {
      return // EOF
    }

    var start = re.lastIndex
    var match = this.eat(re)
    var group, value, text
    if (match === null) {
      group = Lexer.error

      // consume rest of buffer
      text = value = buffer.slice(start)
      re.lastIndex = buffer.length

    } else {
      text = match[0]
      var groups = this.groups
      for (var i = 0; i < groups.length; i++) {
        value = match[i + 1]
        // IE8 returns '' instead of undefined for unreached captures
        if (value) {
          group = groups[i]
          break
        }
      }
      // assert(i < groupCount)
      // TODO is `buffer` being leaked here?
    }

    // count line breaks
    var lineBreaks = 0
    if (group.lineBreaks) {
      var matchNL = /\n/g
      var nl = 1
      if (text === '\n') {
        lineBreaks = 1
      } else {
        while (matchNL.exec(text)) { lineBreaks++; nl = matchNL.lastIndex }
      }
    }

    var size = text.length
    var token = {
      type: group.name,
      value: value,
      toString: tokenToString,
      offset: start,
      size: size,
      lineBreaks: lineBreaks,
      line: this.line,
      col: this.col,
    }

    if (group.pop) this.popState()
    else if (group.push) this.pushState(group.push)
    else if (group.next) this.setState(group.next)

    this.line += lineBreaks
    if (lineBreaks !== 0) {
      this.col = size - nl + 1
    } else {
      this.col += size
    }
    return token
  }

  Lexer.prototype.lexAll = function() {
    var tokens = []
    var token
    while ((token = this.lex())) {
      tokens.push(token)
    }
    return tokens
  }

  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
    var LexerIterator = function(lexer) {
      this.lexer = lexer
    }

    LexerIterator.prototype.next = function() {
      var token = this.lexer.lex()
      return {value: token, done: !token}
    }

    Lexer.prototype[Symbol.iterator] = function() {
      return new LexerIterator(this)
    }
  }

  Lexer.prototype.index = function() {
    return this.re.lastIndex
  }

  Lexer.prototype.reset = function(data, state) {
    this.buffer = data || ''
    this.re.lastIndex = 0
    this.line = state ? state.line : 1
    this.col = state ? state.col : 1
    return this
  }

  Lexer.prototype.save = function() {
    return {
      line: this.line,
      col: this.col,
    }
  }

  Lexer.prototype.feed = function(data) {
    this.buffer += data
    return this
  }

  Lexer.prototype.remaining = function() {
    return this.buffer.slice(this.re.lastIndex)
  }

  Lexer.prototype.clone = function(input) {
    var map = Object.create(null)
    var keys = Object.getOwnPropertyNames(this.states)
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      var s = this.states[key]
      map[key] = {
        groups: s.groups,
        regexp: new RegExp(s.regexp.source, s.regexp.flags),
      }
    }
    return new Lexer(map, this.state, input)
  }


  var moo = {} // TODO: what should moo() do?
  moo.compile = compile
  moo.states = compileStates
  return moo

}))

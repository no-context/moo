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
  var assign = typeof Object.assign === 'function' ? Object.assign :
    // https://tc39.github.io/ecma262/#sec-object.assign
    function(target, sources) {
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

    // nb. error implies lineBreaks
    var options = assign({
      tokenType: name,
      lineBreaks: !!obj.error,
      pop: false,
      next: null,
      push: null,
      error: false,
    }, obj)
    options.keywords = null

    // convert to array
    var match = options.match
    options.match = Array.isArray(match) ? match : match ? [match] : []
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
      result.push(options)

      // add each capturing regexp as a separate rule
      for (var j=0; j<capturingPatterns.length; j++) {
        result.push(assign({}, options, {
          match: [capturingPatterns[j]],
        }))
      }
    }
    return result
  }

  function getIdentifier(literal, otherRules) {
    for (var i=0; i<otherRules.length; i++) {
      var rule = otherRules[i]
      var match = rule.match
      for (var j=0; j<match.length; j++) {
        var pat = match[j]
        if (!isRegExp(pat)) { continue }
        var m = pat.exec(literal)
        if (m && m[0] === literal) {
          return rule
        }
      }
    }
  }

  function compileRules(rules, hasStates) {
    if (!Array.isArray(rules)) rules = objectToRules(rules)

    rules = sortRules(rules)

    var errorRule = null
    var groups = []
    var parts = []
    for (var i=0; i<rules.length; i++) {
      var options = rules[i]

      if (options.error) {
        if (errorRule) {
          throw new Error("Multiple error rules not allowed: (for token '" + options.tokenType + "')")
        }
        errorRule = options
      }

      // look for keywords
      var match = options.match
      var notKeywords = []
      for (var j=0; j<match.length; j++) {
        var word = match[j]
        if (typeof word === 'string') {
          // does it match an existing rule (e.g. identifier?)
          var other = getIdentifier(word, rules)
          if (other) {
            if (!other.keywords) {
              other.keywords = Object.create(null)
            }
            other.keywords[word] = options
            continue
          }
        }
        notKeywords.push(word)
      }
      options.match = notKeywords

      // skip rules with no match
      if (options.match.length === 0) {
        continue
      }
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
        throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.tokenType + "')")
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

    return {regexp: regexp, groups: groups, error: errorRule}
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
          throw new Error("Missing state '" + state + "' (in token '" + g.tokenType + "' of state '" + keys[i] + "')")
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

  Lexer.prototype.setState = function(state) {
    if (!state || this.state === state) return
    this.state = state
    var index = this.re ? this.re.lastIndex : 0
    var info = this.states[state]
    this.groups = info.groups
    this.error = info.error
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

  Lexer.prototype.next = function() {
    var re = this.re
    var buffer = this.buffer

    if (re.lastIndex === buffer.length) {
      return // EOF
    }

    var start = re.lastIndex
    var match = this.eat(re)
    var group, value, text
    if (match === null) {
      group = this.error
      if (!group) {
        // TODO prettier syntax errors
        throw new Error('Syntax error')
      }

      // consume rest of buffer
      text = value = buffer.slice(start)
      re.lastIndex = buffer.length

    } else {
      text = match[0]
      var groups = this.groups
      for (var i = 0; i < groups.length; i++) {
        value = match[i + 1]
        if (value !== undefined) {
          group = groups[i]
          // TODO is `buffer` being leaked here?
          break
        }
      }
      // assert(i < groupCount)

      // check for keywords
      if (group.keywords) {
        group = group.keywords[text] || group
      }
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
      type: group.tokenType,
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

  if (typeof Symbol !== 'undefined' && Symbol.iterator) {
    var LexerIterator = function(lexer) {
      this.lexer = lexer
    }

    LexerIterator.prototype.next = function() {
      var token = this.lexer.next()
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
        error: this.error,
      }
    }
    return new Lexer(map, this.state, input)
  }


  return {
    compile: compile,
    states: compileStates,
    error: Object.freeze({error: true}),
  }

}))

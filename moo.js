(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory) /* global define */
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.moo = factory()
  }
}(this, function() {
  'use strict';

  var hasOwnProperty = Object.prototype.hasOwnProperty

  // polyfill assign(), so we support IE9+
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

  /***************************************************************************/

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
      result.push(ruleOptions(key, object[key]))
    }
    return result
  }

  function arrayToRules(array) {
    var result = []
    for (var i=0; i<array.length; i++) {
      var obj = array[i]
      if (!obj.name) {
        throw new Error('Rule has no name: ' + JSON.stringify(obj))
      }
      result.push(ruleOptions(obj.name, obj))
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
      keywords: null,
    }, obj)

    // convert to array
    var match = options.match
    options.match = Array.isArray(match) ? match : match ? [match] : []
    options.match.sort(function(a, b) {
      return isRegExp(a) && isRegExp(b) ? 0
           : isRegExp(b) ? -1 : isRegExp(a) ? +1 : b.length - a.length
    })
    if (options.keywords) {
      options.getType = keywordTransform(options.keywords)
    }
    return options
  }

  function compileRules(rules, hasStates) {
    rules = Array.isArray(rules) ? arrayToRules(rules) : objectToRules(rules)

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
      if (groupCount > 0) {
        throw new Error("RegExp has capture groups: " + regexp + "\nUse (?: … ) instead")
      }
      if (!hasStates && (options.pop || options.push || options.next)) {
        throw new Error("State-switching options are not allowed in stateless lexers (for token '" + options.tokenType + "')")
      }

      // try and detect rules matching newlines
      if (!options.lineBreaks && regexp.test('\n')) {
        throw new Error('Rule should declare lineBreaks: ' + regexp)
      }

      // store regex
      parts.push(reCapture(pat))
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
        var g = groups[j]
        var state = g && (g.push || g.next)
        if (state && !map[state]) {
          throw new Error("Missing state '" + state + "' (in token '" + g.tokenType + "' of state '" + keys[i] + "')")
        }
        var pop = g && g.pop
        if (pop && typeof pop !== 'number' && typeof pop !== 'boolean') {
          throw new Error("Can't pop non-number '" + pop + "' (in token '" + g.tokenType + "' of state '" + keys[i] + "')")
        }
      }
    }

    return new Lexer(map, start)
  }

  function keywordTransform(map) {
    var reverseMap = Object.create(null)
    var byLength = Object.create(null)
    var types = Object.getOwnPropertyNames(map)
    for (var i=0; i<types.length; i++) {
      var tokenType = types[i]
      var item = map[tokenType]
      var keywordList = Array.isArray(item) ? item : [item]
      keywordList.forEach(function(keyword) {
        (byLength[keyword.length] = byLength[keyword.length] || []).push(keyword)
        reverseMap[keyword] = tokenType
      })
    }

    // fast string lookup
    // https://jsperf.com/string-lookups
    function str(x) { return JSON.stringify(x) }
    var source = ''
    source += '(function(value) {\n'
    source += 'switch (value.length) {\n'
    for (var length in byLength) {
      var keywords = byLength[length]
      source += 'case ' + length + ':\n'
      source += 'switch (value) {\n'
      keywords.forEach(function(keyword) {
        var tokenType = reverseMap[keyword]
        if (typeof tokenType !== 'string') {
          throw new Error('keyword type must be string: ' + name)
        }
        source += 'case ' + str(keyword) + ': return ' + str(tokenType) + '\n'
      })
      source += '}\n'
    }
    source += '}\n'
    source += '})'
    return eval(source) // getType
  }

  /***************************************************************************/

  var Lexer = function(states, state) {
    this.startState = state
    this.states = states
    this.buffer = ''
    this.stack = []
    this.reset()
  }

  Lexer.prototype.reset = function(data, info) {
    this.buffer = data || ''
    this.index = 0
    this.line = info ? info.line : 1
    this.col = info ? info.col : 1
    this.setState(info ? info.state : this.startState)
    return this
  }

  Lexer.prototype.save = function() {
    return {
      line: this.line,
      col: this.col,
      state: this.state,
    }
  }

  Lexer.prototype.setState = function(state) {
    if (!state || this.state === state) return
    this.state = state
    var info = this.states[state]
    this.groups = info.groups
    this.error = info.error
    this.re = info.regexp
  }

  Lexer.prototype.popState = function() {
    this.setState(this.stack.pop())
  }

  Lexer.prototype.pushState = function(state) {
    this.stack.push(this.state)
    this.setState(state)
  }

  Lexer.prototype._eat = hasSticky ? function(re) { // assume re is /y
    return re.exec(this.buffer)
  } : function(re) { // assume re is /g
    var match = re.exec(this.buffer)
    // will always match, since we used the |(?:) trick
    if (match[0].length === 0) {
      return null
    }
    return match
  }

  Lexer.prototype._getGroup = function(match) {
    if (match === null) {
      return -1
    }

    var groupCount = this.groups.length
    for (var i = 0; i < groupCount; i++) {
      if (match[i + 1] !== undefined) {
        return i
      }
    }
    throw new Error('oops')
  }

  function tokenToString() {
    return this.value
  }

  Lexer.prototype.next = function() {
    var re = this.re
    var buffer = this.buffer

    var index = re.lastIndex = this.index
    if (index === buffer.length) {
      return // EOF
    }

    var match = this._eat(re)
    var i = this._getGroup(match)

    var group, value
    if (i === -1) {
      group = this.error

      // consume rest of buffer
      value = buffer.slice(index)

    } else {
      value = match[0] // i+1
      group = this.groups[i]
    }

    // count line breaks
    var lineBreaks = 0
    if (!group || group.lineBreaks) {
      var matchNL = /\n/g
      var nl = 1
      if (value === '\n') {
        lineBreaks = 1
      } else {
        while (matchNL.exec(value)) { lineBreaks++; nl = matchNL.lastIndex }
      }
    }

    var token = {
      type: group && ((group.getType && group.getType(value)) || group.tokenType),
      value: value,
      toString: tokenToString,
      offset: index,
      lineBreaks: lineBreaks,
      line: this.line,
      col: this.col,
    }

    var size = value.length
    this.index += size
    this.line += lineBreaks
    if (lineBreaks !== 0) {
      this.col = size - nl + 1
    } else {
      this.col += size
    }
    // throw, if no rule with {error: true}
    if (!group) {
      throw new Error(this.formatError(token, "invalid syntax"))
    }

    if (group.pop) this.popState()
    else if (group.push) this.pushState(group.push)
    else if (group.next) this.setState(group.next)
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

  Lexer.prototype.formatError = function(token, message) {
    var value = token.value
    var index = token.offset
    var eol = token.lineBreaks ? value.indexOf('\n') : value.length
    var start = Math.max(0, index - token.col + 1)
    var firstLine = this.buffer.substring(start, index + eol)
    message += " at line " + token.line + " col " + token.col + ":\n\n"
    message += "  " + firstLine + "\n"
    message += "  " + Array(token.col).join(" ") + "^"
    return message
  }

  Lexer.prototype.clone = function() {
    return new Lexer(this.states, this.state)
  }

  Lexer.prototype.has = function(tokenType) {
    for (var s in this.states) {
      var groups = this.states[s].groups
      for (var i=0; i<groups.length; i++) {
        var group = groups[i]
        if (group.tokenType === tokenType) return true
        if (group.keywords) {
          for (var k in group.keywords) {
            if (group.keywords[k].tokenType === tokenType) return true
          }
        }
      }
    }
    return false
  }


  return {
    compile: compile,
    states: compileStates,
    error: Object.freeze({error: true}),
  }

}))

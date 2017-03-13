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

  var hasSticky = typeof new RegExp().sticky === 'boolean'


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

    } else if (obj && obj.constructor === RegExp) {
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

  function pattern(obj) {
    if (typeof obj === 'string') {
      return '(' + reEscape(obj) + ')'

    } else if (Array.isArray(obj)) {
      // sort to help ensure longest match
      var options = obj.slice()
      options.sort(compareLength)
      return '(' + options.map(regexpOrLiteral).join('|') + ')'

    } else {
      return regexpOrLiteral(obj)
    }
  }


  function tokenToString() {
    return this.value || this.name
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

  function compile(rules) {
    if (!Array.isArray(rules)) rules = objectToRules(rules)
    var groups = []
    var parts = []
    var keywords = Object.create(null)
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i]
      var name = rule[0]
      var obj = rule[1]

      if (typeof obj === 'string' || obj.constructor === Array) {
        var words = obj.constructor === Array ? obj : [obj]
        var remaining = []
        for (var j = 0; j < words.length; j++) {
          var word = words[j]
          for (var k = 0; k < rules.length; k++) {
            var otherGroup = rules[k][0]
            var other = rules[k][1]
            if (other.constructor === RegExp && other.test(word)) {
              keywords[otherGroup] = keywords[otherGroup] || Object.create(null)
              keywords[otherGroup][word] = name
              break
            }
          }
          if (k === rules.length) {
            remaining.push(word)
          }
        }
        if (remaining.length === 0) {
          continue
        }
        obj = remaining
      }

      // convert string literal to RegExp
      var re = pattern(obj)

      // validate
      if (new RegExp(re).test("")) {
        throw new Error("RegExp matches empty string: " + new RegExp(re))
      }

      // store named group
      var groupCount = reGroups(re)
      if (groupCount > 1) {
        throw new Error("RegExp has more than one capture group: " + re)
      }
      groups.push(name)

      // store regex
      var isCapture = !!groupCount
      if (!isCapture) re = reCapture(re)
      parts.push(re)
    }

    var suffix = hasSticky ? '' : '|(?:)'
    var flags = hasSticky ? 'ym' : 'gm'
    var regexp = new RegExp(reUnion(parts) + suffix, flags)

    return new Lexer(regexp, groups, keywords)
  }


  var Lexer = function(re, groups, keywords, data) {
    this.buffer = data || ''
    this.re = re
    this.groups = groups
    this.keywords = keywords

    // reset RegExp
    re.lastIndex = 0
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

  Lexer.prototype.lex = function() {
    var re = this.re
    var buffer = this.buffer
    var keywords = this.keywords

    if (re.lastIndex === buffer.length) {
      return // EOF
    }

    var start = re.lastIndex
    var match = this.eat(re)
    if (match === null) {
      var remaining = buffer.slice(start)
      var token = {
        name: 'ERRORTOKEN',
        value: remaining,
        size: remaining.length,
        offset: start,
        toString: tokenToString,
      }
      re.lastIndex = buffer.length
      return token
    }

    var group
    var groups = this.groups
    for (var i = 0; i < groups.length; i++) {
      var value = match[i + 1]
      if (value !== undefined) {
        group = groups[i]
        // TODO is `buffer` being leaked here?
        break
      }
    }
    // assert(i < groupCount)

    // check identifier isn't really a keyword
    // we only do this if the group is known to contain keywords,
    // to avoid a performance hit
    if (group in keywords) {
      group = keywords[group][value] || group
    }

    return {
      name: group,
      value: value,
      size: match[0].length,
      offset: re.lastIndex,
      toString: tokenToString,
    }
  }

  Lexer.prototype.lexAll = function() {
    var tokens = []
    var token
    while ((token = this.lex())) {
      tokens.push(token)
    }
    return tokens
  }

  Lexer.prototype.index = function() {
    return this.re.lastIndex
  }

  Lexer.prototype.rewind = function(index) {
    if (index > this.buffer.length) {
      throw new Error("Can't seek forwards")
    }
    this.re.lastIndex = index
    this.buffer = this.buffer.slice(0, index)
    return this
  }

  Lexer.prototype.reset = function(data) {
    this.rewind(0)
    if (data) { this.feed(data) }
    return this
  }

  Lexer.prototype.feed = function(data) {
    this.buffer += data
    return this
  }

  Lexer.prototype.remaining = function() {
    return this.buffer.slice(this.re.lastIndex)
  }

  Lexer.prototype.clone = function(input) {
    var re = new RegExp(this.re.source, this.re.flags)
    return new Lexer(re, this.groups, this.keywords, input)
  }


  function compileLines(rules) {
    if (!Array.isArray(rules)) rules = objectToRules(rules)

    // try and detect rules matching newlines
    for (var i = 0; i < rules.length; i++) {
      var pat = rules[i][1]
      if (pat instanceof RegExp && pat.test('\n')) {
        throw new Error('RegExp matches newline: ' + pat)
      }
    }
    // insert newline rule
    rules.splice(0, 0, ['NL', '\n'])

    return new LineLexer(compile(rules))
  }


  var LineLexer = function(lexer) {
    this.lexer = lexer

    this.lineIndexes = [-1, 0] // 1-based
    this.lineno = 1
    this.col = 0
  }

  LineLexer.prototype.lex = function() {
    var tok = this.lexer.lex()
    if (!tok) {
      return tok
    }
    tok.lineno = this.lineno
    tok.col = this.col

    if (tok.name === 'NL') {
      this.lineno++
      this.col = 0
      this.lineIndexes.push(this.lexer.index())
    } else {
      this.col += tok.size
    }

    // TODO handle error tokens
    return tok
  }

  LineLexer.prototype.lexAll = Lexer.prototype.lexAll

  LineLexer.prototype.reset = function(data) {
    this.rewindLine(1)
    if (data) { this.feed(data) }
    return this
  }

  LineLexer.prototype.feed = function(data) {
    this.lexer.feed(data)
    return this
  }

  LineLexer.prototype.rewindLine = function(lineno) {
    if (lineno < 1) { throw new Error("Line 0 is out-of-bounds") }
    if (lineno > this.lineno) { throw new Error("Can't seek forwards") }
    this.lexer.rewind(this.lineIndexes[lineno])
    // TODO slice buffer
    this.lineIndexes.splice(lineno + 1)
    this.lineno = lineno
    this.col = 0
    return this
  }

  LineLexer.prototype.clone = function(input) {
    return new LineLexer(this.lexer.clone(input))
  }


  var moo = {} // TODO: what should moo() do?
  moo.compile = compile
  moo.lines = compileLines
  return moo

}))

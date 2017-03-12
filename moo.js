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
      return '(' + reEscape(obj) + ')'

    } else if (obj && obj.constructor === RegExp) {
      // TODO: consider /u support
      if (obj.ignoreCase) { throw new Error('RegExp /i flag not allowed') }
      if (obj.global) { throw new Error('RegExp /g flag is implied') }
      if (obj.sticky) { throw new Error('RegExp /y flag is implied') }
      if (obj.multiline) { throw new Error('RegExp /m flag is implied') }
      return obj.source

    } else if (obj && obj.constructor === Array) {
      // sort to help ensure longest match
      var options = obj.slice()
      options.sort(compareLength)
      return '(' + options.map(reEscape).join('|') + ')'

    } else {
      throw new Error('not a pattern: ' + obj)
    }
  }


  function tokenToString() {
    return this.value || this.name
  }


  function compile(rules) {
    var groups = []
    var parts = []
    for (var i=0; i<rules.length; i++) {
      var rule = rules[i]
      var name = rule[0]
      var re = rule[1]

      // convert string literal to RegExp
      re = regexpOrLiteral(re)

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

    return function(input) {
      return new Lexer(regexp, groups, input)
    }
  }


  var Lexer = function(re, groups, data) {
    this.buffer = data || ''
    this.groupCount = groups.length
    this.re = re

    // reset RegExp
    re.lastIndex = 0

    this.groups = groups
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

    var groups = this.groups
    var group
    for (var i = 0; i < this.groupCount; i++) {
      var value = match[i + 1]
      if (value !== undefined) {
        group = groups[i]
        break
      }
    }
    // assert(i < groupCount)
    // TODO is `buffer` being leaked here?

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

  Lexer.prototype.feed = function(data) {
    this.buffer += data
    return this
  }

  Lexer.prototype.remaining = function() {
    return this.buffer.slice(this.re.lastIndex)
  }

  Lexer.prototype.clone = function(input) {
    var re = new RegExp(this.re.source, this.re.flags)
    return new Lexer(re, this.groups, input)
  }


  function compileLines(rules) {
    // try and detect rules matching newlines
    for (var i = 0; i < rules.length; i++) {
      var pat = rules[i][1]
      if (pat instanceof RegExp && pat.test('\n')) {
        throw new Error('RegExp matches newline: ' + pat)
      }
    }
    // insert newline rule
    rules.splice(0, 0, ['NL', '\n'])

    var factory = compile(rules)
    return function(input) {
      return new LineLexer(factory(input))
    }
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

  LineLexer.prototype.feed = function(data) {
    this.lexer.feed(data)
    return this
  }

  LineLexer.prototype.rewindLine = function(lineno) {
    if (lineno > this.lineno) { throw new Error("Can't seek forwards") }
    this.lexer.rewind(this.lineIndexes[lineno])
    // TODO slice buffer
    this.lineIndexes.splice(lineno)
    this.lineno = lineno
    this.col = 0
    return this
  }

  LineLexer.prototype.clone = function(input) {
    return new LineLexer(this.lexer.clone(input))
  }


  var moo = compile
  moo.lines = compileLines
  return moo

}))

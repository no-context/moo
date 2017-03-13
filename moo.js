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
    for (var i=0; i<rules.length; i++) {
      var rule = rules[i]
      var name = rule[0]
      var obj = rule[1]

      // get options
      if (typeof obj !== 'object' || Array.isArray(obj) || isRegExp(obj)) {
        obj = { match: obj }
      }
      var options = Object.assign({
        name: name,
        lineBreaks: false,
      }, obj)
      groups.push(options)

      // convert to RegExp
      var pat = pattern(obj.match)

      // validate
      var regexp = new RegExp(pat)
      if (regexp.test("")) {
        throw new Error("RegExp matches empty string: " + regexp)
      }
      var groupCount = reGroups(pat)
      if (groupCount > 1) {
        throw new Error("RegExp has more than one capture group: " + regexp)
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

    return new Lexer(regexp, groups)
  }


  var Lexer = function(re, groups) {
    this.groups = groups
    this.re = re

    this.reset()
  }

  Lexer.error = {
    name: 'ERRORTOKEN',
    lineBreaks: true,
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
    return this.value || this.name
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
        var value = match[i + 1]
        if (value !== undefined) {
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
      var re = /\n/g
      var nl = 1
      if (text === '\n') {
        lineBreaks = 1
      } else {
        while (re.exec(text)) { lineBreaks++; nl = re.lastIndex }
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
      lineno: this.lineno,
      col: this.col,
    }

    this.lineno += lineBreaks
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

  Lexer.prototype.index = function() {
    return this.re.lastIndex
  }

  Lexer.prototype.reset = function(data) {
    this.buffer = data || ''
    this.re.lastIndex = 0
    this.lineno = 1
    this.col = 1
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


  var moo = {} // TODO: what should moo() do?
  moo.compile = compile
  return moo

}))

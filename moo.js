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
      if (/^\(*\^/.test(obj.source)) {
        throw new Error('RegExp ^ has no effect')
      }
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


  var Token = function(name, value) {
    this.name = name
    this.value = value || ''
  }

  Token.prototype.toString = function() {
    return this.value || this.name
  }


  function compile(rules) {
    var parts = []

    var groups = []
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
      var token = new Token('ERRORTOKEN', buffer.slice(start))
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
    return new Token(group, value)
  }

  Lexer.prototype.lexAll = function() {
    var tokens = []
    var token
    while ((token = this.lex())) {
      tokens.push(token)
    }
    return tokens
  }

  Lexer.prototype.seek = function(index) {
    this.re.lastIndex = index
  }

  Lexer.prototype.feed = function(data) {
    this.buffer += data
  }

  Lexer.prototype.remaining = function() {
    return this.buffer.slice(this.re.lastIndex)
  }

  Lexer.prototype.clone = function(input) {
    var re = new RegExp(this.re.source, this.re.flags)
    return new Lexer(re, this.groups, input)
  }


  var moo = compile
  moo.Token = Token
  return moo

}))

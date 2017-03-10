(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory) /* global define */
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.BrickFace = factory()
  }
}(this, function() {
  'use strict';

  function reEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  function reGroups(s) {
    var re = new RegExp('|' + s)
    return re.exec('').length - 1
  }
  function reCapture(s) {
    return s + '()'
  }
  function reUnion(prefix, regexps, flags) {
    var source =  regexps.map(function(s) {
      return "(?:" + s + ")"
    }).join('|')
    return new RegExp(prefix + "(?:" + source + ")", flags)
  }
  function reLiterals(literals) {
    return new RegExp('(' + literals.map(reEscape).join('|') + ')')
  }


  var Token = function(name, value) {
    this.name = name
    this.value = value || ''
  }

  Token.prototype.toString = function() {
    switch (this.name) {
      case 'NAME':
      case 'OP':
      case 'ERRORTOKEN':
        return this.value
      case 'NEWLINE':
      case 'ENDMARKER':
      default:
        return this.name
    }
  }


  var NamedGroup = function(name, isCapture, regexp) {
    this.name = name
    this.isCapture = isCapture
    this._regexp = regexp // for troubleshooting
  }


  var Lexer = function(tokens) {
    this.parts = []
    this.groups = []
    this.regexp = /^/

    for (var i=0; i<tokens.length; i++) {
      var tok = tokens[i]
      this.addRule(tok[0], tok[1])
    }
  }

  Lexer.prototype.addRule = function(name, re) {
    // convert string literal to RegExp
    re = re instanceof RegExp ? re.source : reEscape(re)

    // validate
    if (new RegExp(re).test("")) {
      throw new Error("Token regexp matches empty string: " + re)
    }

    // store named group
    var groupCount = reGroups(re)
    if (groupCount > 1) {
      throw new Error("Token regexp has more than one capture group: " + re)
    }
    var isCapture = !!groupCount
    this.groups.push(new NamedGroup(name, isCapture, re))

    // store regex
    if (!isCapture) re = reCapture(re)
    this.parts.push(re)
    this.regexp = reUnion('', this.parts, 'g')
  }

  Lexer.prototype.instance = function() {
    return new LexerInstance(this)
  };


  var LexerInstance = function(lexer) {
    this.lexer = lexer

    this.parts = lexer.parts
    this.groups = lexer.groups
    this.regexp = lexer.regexp

    this.buffer = ''
    this.queue = []
    this.regexp.lastIndex = 0
  }

  // consider rewind()

  LexerInstance.prototype.feed = function(input) {
    this.buffer += input
  }

  LexerInstance.prototype.lex = function() {
    var regexp = this.regexp
    var line = this.buffer
    var width = line.length
    var groups = this.groups
    var groupCount = groups.length
    var queue = this.queue

    if (queue.length) {
      return queue.shift()
    }

    if (regexp.lastIndex === width) {
      return // EOF
    }

    var start = regexp.lastIndex
    var match = regexp.exec(line)
    if (!match) {
      regexp.lastIndex = width
      return new Token('ERRORTOKEN', line.slice(start))
    }
    if (match.index > start) { // skipped chars
      queue.push(new Token('ERRORTOKEN', line.slice(start, match.index)))
    }
    // const assert = require('assert')
    // assert(match.length === this.groups.length + 1)
    // assert(match[0].length)
    // assert(regexp.lastIndex === match.index + match[0].length)

    // which group matched?
    var group = null
    for (var i = 0; i < groupCount; i++) {
      var value = match[i + 1]
      if (value !== undefined) {
        group = groups[i]
        break
      }
    } if (i === groupCount) {
      throw "Assertion failed"
    }

    var text = group.isCapture ? value : match[0]
    var token = new Token(group.name, text)
    //console.log('-', token.name, start)

    if (queue.length) {
      queue.push(token)
      return queue.pop()
    }
    return token
  }


  return {
    Lexer: Lexer,
    Token: Token,
    reLiterals: reLiterals,
  }

}))

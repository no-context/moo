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
      if (obj.multiline) { throw new Error('RegExp /y flag is implied') }
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



  var NamedGroup = function(name, isCapture, regexp) {
    this.name = name
    this.isCapture = isCapture
    this._regexp = regexp // for troubleshooting
  }


  var Lexer = function(rules) {
    this.parts = []
    this.groups = []
    this.regexp = /^/

    for (var i=0; i<rules.length; i++) {
      var tok = rules[i]
      this._addRule(tok[0], tok[1])
    }
  }

  Lexer.prototype._addRule = function(name, re) {
    // convert string literal to RegExp
    re = regexpOrLiteral(re)

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
  }

}))

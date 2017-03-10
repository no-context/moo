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

  var hasSticky = typeof new RegExp().sticky === 'boolean'


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
      // TODO: test ^ support
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


  function compile(rules) {
    var parts = []

    var groups = []
    for (var i=0; i<rules.length; i++) {
      var rule = rules[i]
      var name = rule[0], re = rule[1]

      // convert string literal to RegExp
      re = regexpOrLiteral(re)

      // validate
      if (new RegExp(re).test("")) {
        throw new Error("RegExp matches empty string: " + re)
      }

      // store named group
      var groupCount = reGroups(re)
      if (groupCount > 1) {
        throw new Error("RegExp has more than one capture group: " + re)
      }
      var isCapture = !!groupCount
      groups.push(new NamedGroup(name, isCapture, re))

      // store regex
      if (!isCapture) re = reCapture(re)
      parts.push(re)
    }

    var regexp = reUnion(hasSticky ? '' : '', parts, hasSticky ? 'y' : 'g')

    return function(input) {
      return lexer(regexp, groups, input)
    }
  }

  function lexer(regexp, groups, data) {
    // clone RegExp object
    var re = new RegExp(regexp.source, regexp.flags)
    var buffer = data || ''
    var index = 0
    var groupCount = groups.length

    var eat = hasSticky ? function() {
      // assume re has /y flag
      re.lastIndex = index
      var match = re.exec(buffer)
      if (match != null) {
        index += match[0].length
      }
      return match
    } : function() {
      var start = re.lastIndex
      var match = re.exec(buffer)
      
      // did we skip characters?
      if (match.index > start) {
        re.lastIndex = start
        match = null
      }
    }
    // TODO: try instead the |(?:) trick?

    function lex() {
      if (re.lastIndex === buffer.length) {
        return // EOF
      }

      var match = eat()
      if (match === null) {
        throw new Error('Invalid token')
      }

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
      return new Token(group.name, text)
    }

    // TODO multiple states / continuations ?

    var lexer
    return lexer = {
      lex: lex,
      seek: function(newIndex) { index = newIndex },
      feed: function(data) { buffer += data },
      remaining: function() { return buffer.slice(index) },
    }
  }


  return {
    Token: Token,
    compile: compile,
  }

}))

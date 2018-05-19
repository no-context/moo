(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory) /* global define */
  }
  else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  }
  else {
    root.moo = factory()
  }
}(this, function() {
  'use strict';

  var hasOwnProperty = Object.prototype.hasOwnProperty
  var hasSticky = typeof new RegExp().sticky === 'boolean'

  /***************************************************************************/

  function toArray(possiblyArray) {
    if (!possiblyArray) return []
    return Array.isArray(possiblyArray) ? possiblyArray : [possiblyArray]
  }

  function isRegExp(o) { return o && o.constructor === RegExp }
  function isObject(o) { return o && typeof o === 'object' && o.constructor !== RegExp && !Array.isArray(o) }

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

  function regexpOrLiteral(obj) {
    if (typeof obj === 'string') {
      return '(?:' + reEscape(obj) + ')'

    }
    else if (isRegExp(obj)) {
      // TODO: consider /u support
      if (obj.ignoreCase) throw new Error('RegExp /i flag not allowed')
      if (obj.global) throw new Error('RegExp /g flag is implied')
      if (obj.sticky) throw new Error('RegExp /y flag is implied')
      if (obj.multiline) throw new Error('RegExp /m flag is implied')
      return obj.source

    }
    else {
      throw new Error('not a pattern: ' + obj)
    }
  }

  function objectToRules(object) {
    var keys = Object.getOwnPropertyNames(object)
    var result = []
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      var thing = object[key]
      var rules = toArray(thing)
      var match = []
      rules.forEach(function(rule) {
        if (isObject(rule)) {
          if (match.length) result.push(ruleOptions(key, match))
          result.push(ruleOptions(key, rule))
          match = []
        }
        else {
          match.push(rule)
        }
      })
      if (match.length) result.push(ruleOptions(key, match))
    }
    return result
  }

  function arrayToRules(array) {
    var result = []
    for (var i = 0; i < array.length; i++) {
      var obj = array[i]
      if (!obj.name) {
        throw new Error('Rule has no name: ' + JSON.stringify(obj))
      }
      result.push(ruleOptions(obj.name, obj))
    }
    return result
  }

  function flattenCategories(categories) {
    if (categories.length == 0) return null
    else {
      var finalCategories = []
      for (var j = categories.length - 1; j >= 0; j--) {
        var category = categories[j]

        finalCategories.push(category.categoryName)
        // since the parent categories have already been flattened, this works
        if (category.categories) finalCategories.push.apply(finalCategories, category.categories.map((parentCategory) => parentCategory.categoryName))
      }

      return finalCategories
    }
  }

  function ruleOptions(name, obj) {
    if (typeof obj !== 'object' || Array.isArray(obj) || isRegExp(obj)) {
      obj = { match: obj }
    }

    // nb. error implies lineBreaks
    var options = {
      tokenType: name,
      lineBreaks: !!obj.error,
      pop: false,
      next: null,
      push: null,
      error: false,
      value: null,
      getTypeAndCategories: null,
      categories: null,
      keywords: null,
    }

    // Avoid Object.assign(), so we support IE9+
    for (var key in obj) {
      if (hasOwnProperty.call(obj, key)) {
        options[key] = obj[key]
      }
    }

    // convert to array
    var match = options.match
    options.match = Array.isArray(match) ? match : match ? [match] : []
    options.match.sort(function(a, b) {
      return isRegExp(a) && isRegExp(b) ? 0
           : isRegExp(b) ? -1 : isRegExp(a) ? +1 : b.length - a.length
    })

    function normalizeCategories(optionsObject) {
      if (optionsObject.categories) {
        var categories = toArray(optionsObject.categories)
        validateCategories(categories)
        optionsObject.categories = flattenCategories(categories)
      }
      else optionsObject.categories = null
    }

    // coerce undefined or empty arrays to null
    normalizeCategories(options)

    if (options.keywords) {
      if (!Array.isArray(options.keywords)) {
        var typeList = []

        var tokenTypes = Object.getOwnPropertyNames(options.keywords)
        for (var i = tokenTypes.length - 1; i >= 0; i--) {
          var tokenType = tokenTypes[i]
          var keywords = options.keywords[tokenType]
          keywords = toArray(keywords)
          typeList.push({ type: tokenType, values: keywords, categories: options.categories })
        }
        options.keywords = typeList
      }
      else {
        for (var i = options.keywords.length - 1; i >= 0; i--) {
          var keywordObject = options.keywords[i]
          normalizeCategories(keywordObject)

          if (options.categories) {
            if (keywordObject.categories) keywordObject.categories = keywordObject.categories.concat(options.categories)
            else keywordObject.categories = options.categories
          }
        }
      }

      options.keywordMap = {}
      for (var i = options.keywords.length - 1; i >= 0; i--) {
        var keywordObject = options.keywords[i]
        options.keywordMap[keywordObject.type] = keywordObject
      }

      options.getTypeAndCategories = keywordTransform(options.keywords, options.categories)
    }
    return options
  }

  function keywordTransform(types, categories) {
    categories = categories || []

    var reverseMap = Object.create(null)
    var byLength = Object.create(null)
    for (var i = types.length - 1; i >= 0; i--) {
      var item = types[i]
      var keywordList = toArray(item.values)
      var tokenType = item.type

      var tokenCategories = toArray(item.categories)

      for (var j = keywordList.length - 1; j >= 0; j--) {
        var keyword = keywordList[j]
        if (typeof keyword !== 'string') {
          throw new Error("keyword must be string (in keyword '" + tokenType + "')")
        }
        (byLength[keyword.length] = byLength[keyword.length] || []).push(keyword)
        reverseMap[keyword] = { tokenType: tokenType, categories: tokenCategories.length == 0 ? null : tokenCategories }
      }
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
      for (var i = keywords.length - 1; i >= 0; i--) {
        var keyword = keywords[i]
        var tokenTypeAndCategories = reverseMap[keyword]
        source += 'case ' + str(keyword) + ': return ' + str(tokenTypeAndCategories) + '\n'
      }
      source += '}\n'
    }
    source += '}\n'
    source += '})'
    return eval(source) // getTypeAndCategories
  }

  function matchToken(testToken, matchTokenOrCategory) {
    if (testToken === undefined) return false

    if (matchTokenOrCategory.isCategory) {
      if (!testToken.categories) return false

      for (var i = testToken.categories.length - 1; i >= 0; i--) {
        var categoryName = testToken.categories[i]
        if (matchTokenOrCategory.categoryName == categoryName) return true
      }

      return false
    }
    else return testToken.type == matchTokenOrCategory.type
  }

  function matchTokens(testTokens, matchTokensOrCategories) {
    if (testTokens.length != matchTokensOrCategories.length) return false

    for (var i = testTokens.length - 1; i >= 0; i--) {
      var testToken = testTokens[i]
      var matchTokenOrCategory = matchTokensOrCategories[i]
      if (!matchToken(testToken, matchTokenOrCategory)) return false
    }

    return true
   }


  function validateCategories(categoriesArray) {
    if (categoriesArray === null) return

    for (var i = categoriesArray.length - 1; i >= 0; i--) {
      var category = categoriesArray[i]
      if (!category.isCategory) {
        throw new Error("Categories should only be set to category objects: " + category)
      }
    }
  }

  function createCategory(categoryName, parentCategories) {
    var finalCategories = []
    if (parentCategories) {
      parentCategories = toArray(parentCategories)
      validateCategories(parentCategories)

      for (var i = parentCategories.length - 1; i >= 0; i--) {
        var parentCategory = parentCategories[i]
        finalCategories.push(parentCategory)
        if (parentCategory.categories) finalCategories.push.apply(finalCategories, parentCategory.categories)
      }
    }

    return {
      isCategory: true, categoryName: categoryName,
      categories: finalCategories.length != 0 ? finalCategories : null
    }
  }

  function compileRules(rules, hasStates) {
    rules = Array.isArray(rules) ? arrayToRules(rules) : objectToRules(rules)

    var errorRule = null
    var groups = []
    var parts = []
    for (var i = 0; i < rules.length; i++) {
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
    var combined = new RegExp(reUnion(parts) + suffix, flags)

    return {regexp: combined, groups: groups, error: errorRule}
  }

  function compile(rules) {
    var result = compileRules(rules)
    return new Lexer({start: result}, 'start')
  }

  function compileStates(states, start) {
    var keys = Object.getOwnPropertyNames(states)
    if (!start) start = keys[0]

    var map = Object.create(null)
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]
      map[key] = compileRules(states[key], true)
    }

    for (var i = 0; i < keys.length; i++) {
      var groups = map[keys[i]].groups
      for (var j = 0; j < groups.length; j++) {
        var g = groups[j]
        var state = g && (g.push || g.next)
        if (state && !map[state]) {
          throw new Error("Missing state '" + state + "' (in token '" + g.tokenType + "' of state '" + keys[i] + "')")
        }
        if (g && g.pop && +g.pop !== 1) {
          throw new Error("pop must be 1 (in token '" + g.tokenType + "' of state '" + keys[i] + "')")
        }
      }
    }

    return new Lexer(map, start)
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
    this.error = info.error || {lineBreaks: true, shouldThrow: true}
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

    var group, text
    if (i === -1) {
      group = this.error

      // consume rest of buffer
      text = buffer.slice(index)

    }
    else {
      text = match[0]
      group = this.groups[i]
    }

    // count line breaks
    var lineBreaks = 0
    if (group.lineBreaks) {
      var matchNL = /\n/g
      var nl = 1
      if (text === '\n') {
        lineBreaks = 1
      }
      else {
        while (matchNL.exec(text)) { lineBreaks++; nl = matchNL.lastIndex }
      }
    }

    // we'll have to use this area to inject all token categories into the token
    var tokenTypeAndCategories = group.getTypeAndCategories ? group.getTypeAndCategories(text) : undefined
    var tokenType = tokenTypeAndCategories ? tokenTypeAndCategories.tokenType : undefined
    var tokenCategories = tokenTypeAndCategories ? tokenTypeAndCategories.categories : undefined

    var token = {
      type: tokenType || group.tokenType,
      value: group.value ? group.value(text) : text,
      text: text,
      toString: tokenToString,
      offset: index,
      lineBreaks: lineBreaks,
      line: this.line,
      col: this.col,
      categories: tokenCategories || group.categories,
    }
    // nb. adding more props to token object will make V8 sad!

    var size = text.length
    this.index += size
    this.line += lineBreaks
    if (lineBreaks !== 0) {
      this.col = size - nl + 1
    }
    else {
      this.col += size
    }
    // throw, if no rule with {error: true}
    if (group.shouldThrow) {
      throw new Error(this.formatError(token, "invalid syntax"))
    }

    if (group.pop) this.popState()
    else if (group.push) this.pushState(group.push)
    else if (group.next) this.setState(group.next)

    if (group.ignore) return this.next()
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

    LexerIterator.prototype[Symbol.iterator] = function() {
      return this
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
      var state = this.states[s]
      if (state.error && state.error.tokenType === tokenType) return true
      var groups = state.groups
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i]
        if (group.tokenType === tokenType) return true
        if (group.keywords && hasOwnProperty.call(group.keywordMap, tokenType)) {
          return true
        }
      }
    }
    return false
  }

  Lexer.prototype.tokenLibrary = function() {
    var library = {}

    for (var stateKey in this.states) {
      var state = this.states[stateKey]
      for (var i = state.groups.length - 1; i >= 0; i--) {
        var group = state.groups[i]

        if (group.keywords) {
          for (var j = group.keywords.length - 1; j >= 0; j--) {
            var keyword = group.keywords[j]
            var type = keyword.type
            var categories = keyword.categories
            if (type in library) throw new Error("there are overlapping token names in multiple states: " + type)
            library[type] = {
              type: type, categories: categories,
            }
          }
        }

        var type = group.tokenType
        if (type in library) throw new Error("there are overlapping token names in multiple states: " + type)
        library[type] = {
          type: type, categories: group.categories,
        }
      }
    }

    return library
  }


  return {
    compile: compile,
    states: compileStates,
    error: Object.freeze({error: true}),
    matchToken: matchToken,
    matchTokens: matchTokens,
    createCategory: createCategory,
  }

}))

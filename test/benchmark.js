
const fs = require('fs')

const moo = require('../moo')

function reEscape(pat) {
  if (typeof pat === 'string') {
    pat = pat.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  return pat
}

const chevrotain = require('chevrotain')
function chevrotainFromMoo(lexer) {
  const tokens = []
  lexer.groups.forEach(group => {
    var options = group.match.map(pat => typeof pat === 'string' ? reEscape(pat) : pat.source)
    var pat = new RegExp(options.join('|'))
    tokens.push(chevrotain.createToken({name: group.tokenType, pattern: pat}))
  })
  return new chevrotain.Lexer(tokens)
}


suite('startup', () => {

  benchmark('moo.compileStates', () => {
    moo.states({
      main: {
        strstart: {match: '`', push: 'lit'},
        ident:    /\w+/,
        lbrace:   {match: '{', push: 'main'},
        rbrace:   {match: '}', pop: 1},
        colon:    ':',
        space:    {match: /\s+/, lineBreaks: true},
      },
      lit: {
        interp:   {match: '${', push: 'main'},
        escape:   /\\./,
        strend:   {match: '`', pop: 1},
        const:    {match: /(?:[^$`]|\$(?!\{))+/, lineBreaks: true},
      },
    })
  })

})


suite('json', () => {

  let jsonFile = fs.readFileSync('test/sample1k.json', 'utf-8')
  let jsonCount = 4557

  const jsonLexer = require('./json')
  benchmark('🐮 ', function() {
    jsonLexer.reset(jsonFile)
    var count = 0
    while (tok = jsonLexer.next()) { count++ }
    if (count !== jsonCount) { throw 'fail' }
  })

  const Syntax = require('./json-syntax')
  benchmark('syntax-cli', function() {
    Syntax.initString(jsonFile)
    var count = 0
    while (Syntax.getNextToken().type !== '$') { count++ }
    if (count !== jsonCount) throw 'fail'
  })

  const jsonChev = chevrotainFromMoo(jsonLexer)
  benchmark('chevrotain', function() {
    let count = jsonChev.tokenize(jsonFile).tokens.length
    if (count !== jsonCount) { throw 'fail' }
  })

})


suite('tosh', () => {

  const tosh = require('./tosh')
  let toshFile = ''
  for (var i=5; i--; ) { toshFile += tosh.exampleFile }

  benchmark('🐮 ', function() {
    tosh.tokenize(toshFile)
  })

  benchmark('tosh', function() {
    let oldTokens = tosh.oldTokenizer(toshFile)
  })

})


suite('python', () => {

  const python = require('./python')
  let pythonLexer = moo.compile(python.rules)
  let kurtFile = fs.readFileSync('test/kurt.py', 'utf-8')

  let pythonGroups = []
  for (let [name, pat] of python.rules) {
    if (pat instanceof Array) {
      pythonGroups.push({ name: name, regexp: pat.map(reEscape).join('|') })
    } else {
      pythonGroups.push({ name: name, regexp: reEscape(pat.match || pat) })
    }
  }

  benchmark('🐮 ', function() {
    pythonLexer.reset(kurtFile)
    while (pythonLexer.next()) {}
  })

  /* ReMix
   * not strictly a tokenizer, but definitely interesting
   */
  const ReMix = require('remix').ReMix
  let rm = new ReMix
  for (let group of pythonGroups) {
    rm.add({ [group.name]: new RegExp(group.regexp) })
  }
  benchmark('remix', function() {
    var count = 0
    var token
    while (token = rm.exec(kurtFile)) { count++ }
    if (count !== 14513) throw 'fail'
  })


  /* lex
   * I do not know why this one is so slow
   */
  const Lexer = require('lex')
  var lexer = new Lexer
  for (let group of pythonGroups) {
    lexer.addRule(new RegExp(group.regexp), () => group.name)
  }
  benchmark('lex', function() {
    lexer.setInput(kurtFile)
    var count = 0
    var token
    while (token = lexer.lex()) { count++ }
    if (count !== 14513) throw 'fail'
  })

  /* tokenizer2 
   * wrong output. Does not seem to use regexes in the way I expect
   */
  const core = require('tokenizer2/core')
  var t2count
  var t = core(token => {
    // console.log(token)
    t2count++
  })
  for (let group of pythonGroups) {
    t.addRule(new RegExp('^' + group.regexp + '$'), group.name)
  }
  benchmark('tokenizer2', function() {
    t2count = 0
    t.onText(kurtFile)
    t.end()
    // if (t2count !== 14513) throw 'fail'
  })

  /* chevrotain's lexer
   */
  let chevLexer = chevrotainFromMoo(pythonLexer)
  benchmark('chevrotain', function() {
    let count = chevLexer.tokenize(kurtFile).tokens.length
    if (count !== 14513) throw 'fail'
  })

  /* lexing
   *
   * wrong output -- I don't think it likes our triple-quoted strings?
   * Does pretty well considering, though!
  const lexing = require('lexing')
  let lexingRules = [
    [/^$/, function(match) { return { type: 'EOF' } }],
  ]
  for (let group of pythonGroups) {
    lexingRules.push([new RegExp('^' + group.regexp), function(match) {
      return { type: group.name, value: match[1] || match[0] }
    }])
  }
  const lexingTokenizer = new lexing.Tokenizer(lexingRules)
  benchmark('lexing', function() {
    let input = new lexing.StringIterator(kurtFile);
    let output = lexingTokenizer.map(input)
    var count = 0
    var token
    while ((token = output.next()).type !== 'EOF') {
      // console.log(token.type, JSON.stringify(token.value))
      count++
    }
    // if (count !== 14513) throw 'fail'
  })
   */

})

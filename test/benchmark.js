
const fs = require('fs')

const moo = require('../moo')

function reEscape(pat) {
  if (typeof pat === 'string') {
    pat = pat.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  return pat
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)]
}

const chevrotain = require('chevrotain')
function chevrotainFromMoo(lexer) {
  const tokens = []
  var keys = Object.keys(lexer.fast)
  for (var i=0; i<keys.length; i++) {
    var charCode = keys[i]
    var word = String.fromCharCode(charCode)
    tokens.push(chevrotain.createToken({name: `fast${i}`, pattern: word}))
  }
  lexer.groups.forEach(group => {
    var options = group.match.map(pat => typeof pat === 'string' ? reEscape(pat) : pat.source)
    var pat = new RegExp(options.join('|'))
    tokens.push(chevrotain.createToken({name: group.defaultType, pattern: pat}))
  })
  // "onlyStart" will track startOffset, startLine, startColumn.
  // By default endOffset, endLine and endColumn will also be tracked at the cost of a few % points in performance.
  return new chevrotain.Lexer(tokens, {positionTracking:"onlyStart"})
}


suite('startup', () => {

  benchmark('moo.compileStates', () => {
    moo.states({
      main: {
        strstart: {match: '`', push: 'lit'},
        ident:    /\w+/,
        lbrace:   {match: '{', push: 'main'},
        rbrace:   {match: '}', pop: true},
        colon:    ':',
        space:    {match: /\s+/, lineBreaks: true},
      },
      lit: {
        interp:   {match: '${', push: 'main'},
        escape:   /\\./,
        strend:   {match: '`', pop: true},
        const:    {match: /(?:[^$`]|\$(?!\{))+/, lineBreaks: true},
      },
    })
  })

})

suite('keywords', () => {

  const keywords = 'cow moo bovine udder hoof cheese milk cud grass moo moo bull calf friesian jersey alderney angus beef highland cattle'.split(' ')
  const words = keywords.concat('orange fruit apple pear kiwi fire pineapple pirahna kale kumquat starfruit dragonfruit passion sharon physalis gooseberry'.split(' '))
  var source = ''
  for (var i=2000; i--; ) {
    source += randomChoice(words) + ' '
  }

  const lexer = moo.compile({
    name: {match: /[a-z]+/, keywords: moo.keywords({cowword: keywords})},
    space: {match: /\s+/, lineBreaks: true},
  })
  lexer.reset(source)

  // test
  for (let tok in lexer) {
    switch (tok.type) {
      case 'space': continue
      case 'cowword': expect(keywords.indexOf(tok.value)).not.toBe(-1); continue
      case 'name': expect(keywords.indexOf(tok.value)).toBe(-1); continue
    }
  }

  benchmark('🐮 ', () => {
    lexer.reset(source)
    var count = 0
    while (tok = lexer.next()) { count++ }
  })

})


suite('json', () => {

  let jsonFile = fs.readFileSync('test/sample1k.json', 'utf-8')
  let jsonCount = 4557

  const manual = require('./manual')
  benchmark('hand-written', function() {
    // TODO don't decode JSON strings; only recognise them
    let next = manual(jsonFile)
    var count = 0
    while (tok = next()) { count++ }
    if (count !== jsonCount) { throw 'fail' }
  })

  const jsonLexer = require('./json')
  benchmark('🐮 ', function() {
    jsonLexer.reset(jsonFile)
    var count = 0
    while (tok = jsonLexer.next()) { count++ }
    if (count !== jsonCount) { throw 'fail' }
  })

  const jsonChev = chevrotainFromMoo(jsonLexer)
  benchmark('chevrotain', function() {
    let count = jsonChev.tokenize(jsonFile).tokens.length
    if (count !== jsonCount) { throw 'fail' }
  })

  const Syntax = require('./json-syntax')
  benchmark('syntax-cli', function() {
    Syntax.initString(jsonFile)
    var count = 0
    while (Syntax.getNextToken().type !== '$') { count++ }
    if (count !== jsonCount) throw 'fail'
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

  const pythonLexer = require('./python').lexer
  const pythonTokenize = require('./python').tokenize
  let kurtFile = fs.readFileSync('test/kurt.py', 'utf-8')

  benchmark('🐮 lex', function() {
    pythonLexer.reset(kurtFile)
    while (pythonLexer.next()) {}
  })

  benchmark('🐮 full tokenize', function() {
    pythonTokenize(kurtFile, () => {
    })
  })


  //chevrotain's lexer
  let chevLexer = chevrotainFromMoo(pythonLexer)
  benchmark('chevrotain', function() {
    let lexResult = chevLexer.tokenize(kurtFile)
  })

  /*
  let pythonGroups = []
  for (let options of pythonLexer.groups) {
    let name = options.tokenType
    let match = options.match
    if (typeof match[0] === 'string') {
      var regexp = new RegExp(match.map(reEscape).join('|'))
    } else {
      var regexp = new RegExp(match.map(re => re.source).join('|'))
    }
    pythonGroups.push({name, regexp})
  }

  // ReMix
  // not strictly a tokenizer, but definitely interesting
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

  // lex
  // I do not know why this one is so slow
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
  */

  /* tokenizer2
   * wrong output. Does not seem to use regexes in the way I expect
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
   */

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

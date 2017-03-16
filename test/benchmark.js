
const fs = require('fs')
const Benchmark = require('benchmark')

const moo = require('../moo')

let suite = new Benchmark.Suite()


const python = require('./python')
let pythonLexer = moo.compile(python.rules)
let kurtFile = fs.readFileSync('test/kurt.py', 'utf-8')


function reEscape(pat) {
  if (typeof pat === 'string') {
    pat = pat.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
  }
  return pat
}

let groups = []
for (let [name, pat] of python.rules) {
  if (pat instanceof Array) {
    groups.push({ name: name, regexp: pat.map(reEscape).join('|') })
  } else {
    groups.push({ name: name, regexp: reEscape(pat.match || pat) })
  }
}

/*****************************************************************************/

suite.add('moo.compileStates', () => {
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

/*****************************************************************************/
// tokenizing JSON

let jsonFile = fs.readFileSync('test/sample1k.json', 'utf-8'), jsonCount = 2949
// let jsonFile = fs.readFileSync('test/sample10k.json', 'utf-8'), jsonCount = 29753

/* moo! */
const json = require('./json')
suite.add('moo JSON', function() {
  json.reset(jsonFile)
  var count = 0
  while (tok = json.next()) {
    if (tok.type !== 'space') count++
  }
  if (count !== jsonCount) throw 'fail'
})

/* syntax-cli
 */
const Syntax = require('./json-syntax')
suite.add('syntax-cli JSON', function() {
  Syntax.initString(jsonFile)
  var count = 0
  while (Syntax.getNextToken().type !== '$') { count++ }
  if (count !== jsonCount) throw 'fail'
})

/*****************************************************************************/

const tosh = require('./tosh')
let toshFile = tosh.exampleFile + tosh.exampleFile  + tosh.exampleFile + tosh.exampleFile + tosh.exampleFile

suite.add('moo tosh', function() {
  tosh.tokenize(toshFile)
})

suite.add('tosh', function() {
  let oldTokens = tosh.oldTokenizer(toshFile)
})


/*****************************************************************************/
// tokenizing Python

/* moo! */
suite.add('moo', function() {
  pythonLexer.reset(kurtFile)
  while (pythonLexer.next()) {}
})


/* ReMix
 *
 * not strictly a tokenizer, but definitely interesting
 */
const ReMix = require('remix').ReMix
let rm = new ReMix
for (let group of groups) {
  rm.add({ [group.name]: new RegExp(group.regexp) })
}
suite.add('remix', function() {
  var count = 0
  var token
  while (token = rm.exec(kurtFile)) {
    count++
  }
  if (count !== 14513) throw 'fail'
})


/* lex
 * I do not know why this one is so slow
 */
const Lexer = require('lex')
var lexer = new Lexer
for (let group of groups) {
  lexer.addRule(new RegExp(group.regexp), () => group.name)
}
suite.add('lex', function() {
  lexer.setInput(kurtFile)
  var count = 0
  var token
  while (token = lexer.lex()) {
    count++
  }
  if (count !== 14513) throw 'fail'
})


/* tokenizer2 
 *
 * wrong output. Does not seem to use regexes in the way I expect
 */
const core = require('tokenizer2/core')
var t2count
var t = core(token => {
  // console.log(token)
  t2count++
})
for (let group of groups) {
  t.addRule(new RegExp('^' + group.regexp + '$'), group.name)
}
suite.add('tokenizer2', function() {
  t2count = 0
  t.onText(kurtFile)
  t.end()
  // if (t2count !== 14513) throw 'fail'
})


/* chevrotain's lexer
 */
const chev = require('chevrotain')
let createToken = chev.createLazyToken
let chevTokens = []
for (let group of groups) {
  chevTokens.push(createToken({ name: group.name, pattern: new RegExp(group.regexp) }))
}
let chevLexer = new chev.Lexer(chevTokens);
suite.add('chevrotain', function() {
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
for (let group of groups) {
  lexingRules.push([new RegExp('^' + group.regexp), function(match) {
    return { type: group.name, value: match[1] || match[0] }
  }])
}
const lexingTokenizer = new lexing.Tokenizer(lexingRules)
suite.add('lexing', function() {
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


suite.on('cycle', function(event) {
    var bench = event.target;
    if (bench.error) {
        console.log('  ✘ ', bench.name)
        console.log(bench.error.stack)
        console.log('')
    } else {
        console.log('  ✔ ' + bench)
    }
})
.on('complete', function() {
    // TODO: report geometric mean.
})
.run()



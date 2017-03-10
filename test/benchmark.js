
const fs = require('fs')
const Benchmark = require('benchmark')

const Moo = require('../moo')

let suite = new Benchmark.Suite()


const python = require('./python')
let pythonFile = python.pythonFile
let pythonFactory = Moo.compile(python.rules)
let kurtFile = fs.readFileSync('test/kurt.py', 'utf-8')

/*
suite.add('python', function() {
  tokenizePython(pythonFile, () => {})
})

let pythonFile10 = ''
for (var i = 10; i--; ) { pythonFile10 += pythonFile }
suite.add('python x10', function() {
  tokenizePython(pythonFile10, () => {})
})

let pythonFile100 = ''
for (var i = 100; i--; ) { pythonFile100 += pythonFile }
suite.add('python x100', function() {
  tokenizePython(pythonFile100, () => {})
})
*/

suite.add('moo', function() {
  pythonFactory(kurtFile).lexAll()
})

/* lex
 */
const Lexer = require('lex')
var lexer = new Lexer
for (let group of pythonFactory().groups) {
  lexer.addRule(new RegExp(group.regexp), () => group.name)
}
suite.add('lex', function() {
  lexer.setInput(kurtFile)
  var count = 0
  while (lexer.lex()) { count++ }
})

/* tokenizer2 
 *
 * handicap: this is doing line/col tracking
 */
const core = require('tokenizer2/core')
var t = core(token => {})
for (let group of pythonFactory().groups) {
  t.addRule(new RegExp('^' + group.regexp + '$'), group.name)
}
suite.add('tokenizer2', function() {
  t.onText(kurtFile)
  t.end()
})

/* chevrotain's lexer
 */
const chev = require('chevrotain')
let createToken = chev.createLazyToken
let chevTokens = []
for (let group of pythonFactory().groups) {
  chevTokens.push(createToken({ name: group.name, pattern: new RegExp(group.regexp) }))
}
let chevLexer = new chev.Lexer(chevTokens);
suite.add('chevrotain', function() {
  let count = chevLexer.tokenize(kurtFile).tokens.length
})

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



const fs = require('fs')
const path = require('path')
const Benchmark = require('benchmark')

function run(suite) {
    console.log('\n' + suite.name)
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
}

const suite = new Benchmark.Suite('JSON')
const jsonPath = path.resolve(__dirname, './sample1k.json')
const jsonFile = fs.readFileSync(jsonPath, 'utf-8')
const expectedJsonTokenCount = 4557
const expectedJsonTokenCountNoSpace = 2949

/* moo! */
const mooJson = require('./json')
suite.add('🐮 ', function() {
    mooJson.reset(jsonFile)
    let count = 0
    while (tok = mooJson.next()) {
        count++
    }
    if (count !== expectedJsonTokenCount) {
        throw 'fail'
    }
})

/* syntax-cli */
const Syntax = require('./json-syntax')
suite.add('syntax-cli', function() {
    Syntax.initString(jsonFile)
    let count = 0
    while (Syntax.getNextToken().type !== '$') { count++ }
    if (count !== expectedJsonTokenCountNoSpace) {
        throw 'fail'
    }
})

/* Chevrotain */
const chevrotain = require("chevrotain");
const createToken = chevrotain.createSimpleLazyToken
const ChevrotainLexer = chevrotain.Lexer
const chevrotainTokens = []

// Create Chevrotain Lexer using Moo's definitions
mooJson.groups.forEach((currGroup) => {
    let currMatch = currGroup.match[0]
    let currRegExp = typeof currMatch === "string" ?
        new RegExp(currMatch.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')) :
        currMatch
    chevrotainTokens.push(createToken({name: currGroup.tokenType, pattern: currRegExp}))
})

const chevrotainJson = new ChevrotainLexer(chevrotainTokens);
suite.add('Chevrotain', function() {
    let lexResult = chevrotainJson.tokenize(jsonFile)
    if (lexResult.tokens.length !== expectedJsonTokenCount) {
        throw 'fail'
    }
})

run(suite)

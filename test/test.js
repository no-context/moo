
const fs = require('fs')

const moo = require('../moo')
const compile = moo.compile
const python = require('./python')

function lexAll(lexer) {return Array.from(lexer)}


describe('compiler', () => {

  // TODO handles empty rule set

  test("warns for /g, /y, /i, /m", () => {
    expect(() => compile({ word: /foo/ })).not.toThrow()
    expect(() => compile({ word: /foo/g })).toThrow()
    expect(() => compile({ word: /foo/i })).toThrow()
    expect(() => compile({ word: /foo/y })).toThrow()
    expect(() => compile({ word: /foo/m })).toThrow()
  })

  // TODO warns if no lineBreaks: true

  test('warns about missing states', () => {
    const rules = [
      {match: '=', next: 'missing'},
      {match: '=', push: 'missing'},
    ]
    for (const rule of rules) {
      expect(() => moo.states({start: {thing: rule}}))
      .toThrow("Missing state 'missing' (in token 'thing' of state 'start')")
    }
  })

  test('warns about inappropriate state-switching options', () => {
    const rules = [
      {match: '=', next: 'state'},
      {match: '=', push: 'state'},
      {match: '=', pop: true},
    ]
    for (const rule of rules) {
      expect(() => moo.compile({thing: rule}))
      .toThrow("State-switching options are not allowed in stateless lexers (for token 'thing')")
    }
  })

  test('accepts rules in an object', () => {
    const lexer = compile({
      word: /[a-z]+/,
      number: /[0-9]+/,
      space: / +/,
    })
    lexer.reset('ducks are 123 bad')
    expect(lexer.next()).toMatchObject({type: 'word', value: 'ducks'})
    expect(lexer.next()).toMatchObject({type: 'space', value: ' '})
  })

  test('accepts rules in an array', () => {
    const lexer = compile([
      { name: 'keyword', match: 'Bob'},
      { name: 'word', match: /[a-z]+/},
      { name: 'number', match: /[0-9]+/},
      { name: 'space', match: / +/},
    ])
    lexer.reset('Bob ducks are 123 bad')
    expect(lexer.next()).toMatchObject({type: 'keyword', value: 'Bob'})
    expect(lexer.next()).toMatchObject({type: 'space', value: ' '})
    expect(lexer.next()).toMatchObject({type: 'word', value: 'ducks'})
    expect(lexer.next()).toMatchObject({type: 'space', value: ' '})
  })

  test('accepts a list of RegExps', () => {
    const lexer = compile({
      number: [
        /[0-9]+\.[0-9]+/,
        /[0-9]+/,
      ],
      space: / +/,
    })
    lexer.reset('12.04 123 3.14')
    var tokens = lexAll(lexer).filter(t => t.type !== 'space')
    expect(tokens.shift()).toMatchObject({type: 'number', value: '12.04'})
    expect(tokens.shift()).toMatchObject({type: 'number', value: '123'})
    expect(tokens.shift()).toMatchObject({type: 'number', value: '3.14'})
  })

})

describe('compiles literals', () => {

  // TODO test they're escaped

  test('sorts RegExps and strings', () => {
    let lexer = moo.compile({
      tok: [/t[ok]+/, /\w/, 'foo', 'token']
    })
    expect(lexer.re.source.replace(/[(?:)]/g, '')).toBe('token|foo|t[ok]+|\\w')
  })

  test('sorts literals by length', () => {
    let lexer = moo.compile({
      op: ['=', '==', '===', '+', '+='],
      space: / +/,
    })
    lexer.reset('=== +=')
    expect(lexer.next()).toMatchObject({value: '==='})
    expect(lexer.next()).toMatchObject({type: 'space'})
    expect(lexer.next()).toMatchObject({value: '+='})
  })

  test('but doesn\'t sort literals across rules', () => {
    let lexer = moo.compile({
      one: 'moo',
      two: 'moomintroll',
    })
    lexer.reset('moomintroll')
    expect(lexer.next()).toMatchObject({value: 'moo'})
  })

})

describe('keywords', () => {

  test('supports explicit keywords', () => {
    function check(lexer) {
      lexer.reset('class')
      expect(lexer.next()).toMatchObject({ type: 'keyword', value: 'class' })
      expect(lexer.next()).not.toBeTruthy()
      lexer.reset('className')
      expect(lexer.next()).toMatchObject({ type: 'identifier', value: 'className' })
      expect(lexer.next()).not.toBeTruthy()
    }

    check(compile({
      identifier: {match: /[a-zA-Z]+/, keywords: {keyword: 'class'}},
    }))
    check(compile({
      identifier: {match: /[a-zA-Z]+/, keywords: {keyword: ['class']}},
    }))
  })

  test('keywords can have individual tokenTypes', () => {
    let lexer = compile({
      identifier: {
        match: /[a-zA-Z]+/,
        keywords: {
          'kw-class': 'class',
          'kw-def': 'def',
          'kw-if': 'if',
        },
      },
      space: {match: /\s+/, lineBreaks: true},
    })
    lexer.reset('foo def')
    expect(Array.from(lexer).map(t => t.type)).toEqual([
        'identifier',
        'space',
        'kw-def',
    ])
  })

})

describe('capture groups', () => {

  test('allow no capture groups', () => {
    let lexer = compile({
      a: /a+/,
      b: /b|c/,
    })
    lexer.reset('aaaaabcbcbcbc')
    expect(lexer.next().value).toEqual('aaaaa')
    expect(lexer.next().value).toEqual('b')
    expect(lexer.next().value).toEqual('c')
    expect(lexer.next().value).toEqual('b')
  })

  test('are not allowed', () => {
    expect(() => moo.compile({
      tok: [/(foo)/, /(bar)/]
    })).toThrow("has capture groups")
  })

})

describe('lexer', () => {

  var simpleLexer = compile({
    word: /[a-z]+/,
    number: /[0-9]+/,
    ws: / +/,
  })

  test('works', () => {
    simpleLexer.reset('ducks are 123 bad')
    expect(simpleLexer.next()).toMatchObject({ type: 'word', value: 'ducks' })
    expect(simpleLexer.next()).toMatchObject({ type: 'ws', value: ' ' })
    expect(simpleLexer.next()).toMatchObject({ type: 'word', value: 'are' })
  })

  test('is iterable', () => {
    simpleLexer.reset('only 321 cows')
    const toks = [['word', 'only'], ['ws', ' '], ['number', '321'], ['ws', ' '], ['word', 'cows']]
    for (const t of simpleLexer) {
      const [type, value] = toks.shift()
      expect(t).toMatchObject({type, value})
    }
    expect(simpleLexer.next()).not.toBeTruthy()
  })

  test('multiline RegExps', () => {
    var lexer = compile({
      file: { match: /[^]+/, lineBreaks: true },
    }).reset('I like to moo\na lot')
    expect(lexer.next().value).toBe('I like to moo\na lot')
  })

  test('can match EOL $', () => {
    var lexer = compile({
      x_eol: /x$/,
      x: /x/,
      WS: / +/,
      NL: { match: /\n/, lineBreaks: true },
      other: /[^ \n]+/,
    }).reset('x \n x\n yz x')
    let tokens = lexAll(lexer).filter(t => t.type !== 'WS')
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['x', 'x'],
      ['NL', '\n'],
      ['x_eol', 'x'],
      ['NL', '\n'],
      ['other', 'yz'],
      ['x_eol', 'x'],
    ])
  })

  test('can match BOL ^', () => {
    var lexer = compile({
      x_bol: /^x/,
      x: /x/,
      WS: / +/,
      NL: { match: /\n/, lineBreaks: true },
      other: /[^ \n]+/,
    }).reset('x \n x\nx yz')
    let tokens = lexAll(lexer).filter(t => t.type !== 'WS')
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['x_bol', 'x'],
      ['NL', '\n'],
      ['x', 'x'],
      ['NL', '\n'],
      ['x_bol', 'x'],
      ['other', 'yz'],
    ])
  })

  test('Token#toString', () => {
    // TODO: why does toString() return the value?
    const lexer = compile({
      apples: 'a',
      name: {match: /[a-z]/, keywords: { kw: ['m'] }},
    }).reset('azm')
    expect(String(lexer.next())).toBe('a')
    expect(String(lexer.next())).toBe('z')
    expect(String(lexer.next())).toBe('m')
  })

  test('can be cloned', () => {
    let lexer = compile({
      word: /[a-z]+/,
      digit: /[0-9]/,
    })
    lexer.reset('abc9')
    let clone = lexer.clone()
    clone.reset('123')
    expect(lexer.next()).toMatchObject({value: 'abc', offset: 0})
    expect(clone.next()).toMatchObject({value: '1', offset: 0})
    expect(lexer.next()).toMatchObject({value: '9', offset: 3})
    expect(clone.next()).toMatchObject({value: '2', offset: 1})
  })

})


describe('Lexer#has', () => {

  const basicLexer = compile({
    keyword: 'foo',
    identifier: /[a-z]+/
  })

  test('supports has()', () => {
    expect(basicLexer.has('identifier')).toBe(true)
  })

  test('works with keyword tokens', () => {
    expect(basicLexer.has('keyword')).toBe(true)
  })

  test('returns false for nonexistent junk', () => {
    expect(basicLexer.has('random')).toBe(false)
  })

  test('returns false for stuff inherited from Object', () => {
    expect(basicLexer.has('hasOwnProperty')).toBe(false)
  })

  // Example from the readme.
  const statefulLexer = moo.states({
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

  test('works with multiple states - for first state', () => {
    expect(statefulLexer.has('ident')).toEqual(true)
  })

  test('works with multiple states - for second state', () => {
    expect(statefulLexer.has('interp')).toEqual(true)
  })

  test('returns false for the state names themselves', () => {
    expect(statefulLexer.has('main')).toEqual(false)
  })

  test('returns false for stuff inherited from Object when using states', () => {
    expect(statefulLexer.has('toString')).toEqual(false)
  })

})


describe('stateful lexer', () => {

  const statefulLexer = moo.states({
    start: {
      word: /\w+/,
      eq: {match: '=', next: 'ab'},
    },
    ab: {
      a: 'a',
      b: 'b',
      semi: {match: ';', next: 'start'},
    },
  })

  test('switches states', () => {
    statefulLexer.reset('one=ab;two=')
    expect(lexAll(statefulLexer).map(({type, value}) => [type, value])).toEqual([
      ['word', 'one'],
      ['eq', '='],
      ['a', 'a'],
      ['b', 'b'],
      ['semi', ';'],
      ['word', 'two'],
      ['eq', '='],
    ])
  })

  const parens = moo.states({
    start: {
      word: /\w+/,
      lpar: {match: '(', push: 'inner'},
      rpar: ')',
    },
    inner: {
      thing: /\w+/,
      lpar: {match: '(', push: 'inner'},
      rpar: {match: ')', pop: true},
    },
  })

  test('maintains a stack', () => {
    parens.reset('a(b(c)d)e')
    expect(lexAll(parens).map(({type, value}) => [type, value])).toEqual([
      ['word', 'a'],
      ['lpar', '('],
      ['thing', 'b'],
      ['lpar', '('],
      ['thing', 'c'],
      ['rpar', ')'],
      ['thing', 'd'],
      ['rpar', ')'],
      ['word', 'e'],
    ])
  })

  test('allows popping too many times', () => {
    parens.reset(')e')
    expect(lexAll(parens).map(({type, value}) => [type, value])).toEqual([
      ['rpar', ')'],
      ['word', 'e'],
    ])
  })

  test('resets state', () => {
    statefulLexer.reset('one=a')
    expect(statefulLexer.state).toBe('start')
    expect(lexAll(statefulLexer).map(({type, value}) => [type, value])).toEqual([
      ['word', 'one'],
      ['eq', '='],
      ['a', 'a'],
    ])
    expect(statefulLexer.state).toBe('ab')
    statefulLexer.reset('one=ab;two=')
    expect(statefulLexer.state).toBe('start')
  })

  test('lexes interpolation example', () => {
    let lexer = moo.states({
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
    }).reset('`a${{c: d}}e`')
    expect(lexAll(lexer).map(t => t.type).join(' ')).toBe('strstart const interp lbrace ident colon space ident rbrace rbrace const strend')
  })

})


describe('line numbers', () => {

  var testLexer = compile({
    WS: / +/,
    word: /[a-z]+/,
    NL: { match: /\n/, lineBreaks: true },
  })

  test('counts line numbers', () => {
    var tokens = lexAll(testLexer.reset('cow\nfarm\ngrass'))
    expect(tokens.map(t => t.value)).toEqual(['cow', '\n', 'farm', '\n', 'grass'])
    expect(tokens.map(t => t.lineBreaks)).toEqual([0, 1, 0, 1, 0])
    expect(tokens.map(t => t.line)).toEqual([1, 1, 2, 2, 3])
    expect(tokens.map(t => t.col)).toEqual([1, 4, 1, 5, 1])
  })

  test('tracks columns', () => {
    var lexer = compile({
      WS: / +/,
      thing: { match: /[a-z\n]+/, lineBreaks: true },
    })
    lexer.reset('pie cheese\nsalad what\n ')
    expect(lexer.next()).toMatchObject({ value: 'pie', col: 1 })
    expect(lexer.next()).toMatchObject({ value: ' ', col: 4 })
    expect(lexer.next()).toMatchObject({ value: 'cheese\nsalad', col: 5, line: 1 })
    expect(lexer.next()).toMatchObject({ value: ' ', col: 6, line: 2 })
    expect(lexer.next()).toMatchObject({ value: 'what\n', col: 7, line: 2 })
    expect(lexer.next()).toMatchObject({ value: ' ', col: 1, line: 3 })
  })

  test('tries to warn if rule matches \\n', () => {
    expect(() => compile({whitespace: /\s+/})).toThrow()
    expect(() => compile({multiline: /q[^]*/})).not.toThrow()
  })

  test('resets line/col', () => {
    var lexer = compile({
      WS: / +/,
      word: /[a-z]+/,
      NL: { match: '\n', lineBreaks: true },
    })
    lexer.reset('potatoes\nsalad')
    expect(lexer).toMatchObject({buffer: 'potatoes\nsalad', line: 1, col: 1})
    lexAll(lexer)
    expect(lexer).toMatchObject({line: 2, col: 6})
    lexer.reset('cheesecake')
    expect(lexer).toMatchObject({buffer: 'cheesecake', line: 1, col: 1})
  })

})


describe('save/restore', () => {

  const testLexer = compile({
    word: /[a-z]+/,
    NL: { match: '\n', lineBreaks: true },
  })

  test('can save info', () => {
    testLexer.reset('one\ntwo')
    lexAll(testLexer)
    expect(testLexer.save()).toMatchObject({line: 2, col: 4})
  })

  test('can restore info', () => {
    testLexer.reset('\nthree', {line: 2, col: 4})
    expect(testLexer).toMatchObject({line: 2, col: 4, buffer: '\nthree'})
  })

  const statefulLexer = moo.states({
    start: {
      word: /\w+/,
      eq: {match: '=', next: 'ab'},
    },
    ab: {
      a: 'a',
      b: 'b',
      semi: {match: ';', next: 'start'},
    },
  })

  test('info includes state', () => {
    statefulLexer.reset('one=ab')
    statefulLexer.next()
    expect(statefulLexer.state).toBe('start')
    expect(statefulLexer.save()).toMatchObject({state: 'start'})
    statefulLexer.next()
    expect(statefulLexer.state).toBe('ab')
    expect(statefulLexer.save()).toMatchObject({state: 'ab'})
  })

  test('can restore state', () => {
    statefulLexer.reset('ab', {line: 0, col: 0, state: 'ab'})
    expect(statefulLexer.state).toBe('ab')
    expect(lexAll(statefulLexer).length).toBe(2)
  })

})


describe('errors', () => {

  test('are thrown by default', () => {
    let lexer = compile({
      digits: /[0-9]+/,
      nl: {match: '\n', lineBreaks: true},
    })
    lexer.reset('123\n456baa')
    expect(lexer.next()).toMatchObject({value: '123'})
    expect(lexer.next()).toMatchObject({type: 'nl'})
    expect(lexer.next()).toMatchObject({value: '456'})
    expect(() => lexer.next()).toThrow(
      "invalid syntax at line 2 col 4:\n\n" +
      "  456baa\n" +
      "     ^"
    )
  })

  test('can be externally formatted', () => {
    let lexer = compile({
      letters: {match: /[a-z\n]+/, lineBreaks: true},
      error: moo.error,
    })
    lexer.reset('abc\ndef\ng 12\n345\n6')
    expect(lexer.next()).toMatchObject({type: 'letters', value: 'abc\ndef\ng'})
    const tok = lexer.next()
    expect(tok).toMatchObject({type: 'error', value: ' 12\n345\n6', lineBreaks: 2})
    expect(lexer.formatError(tok, "numbers!")).toBe(
      "numbers! at line 3 col 2:\n\n" +
      "  g 12\n" +
      "   ^"
    )
  })

  test('seek to end of buffer when thrown', () => {
    let lexer = compile({
      digits: /[0-9]+/,
    })
    lexer.reset('invalid')
    expect(() => lexer.next()).toThrow()
    expect(lexer.next()).toBe(undefined)
  })

  test('can be tokens', () => {
    let lexer = compile({
      digits: /[0-9]+/,
      error: moo.error,
    })
    expect(lexer.error).toMatchObject({tokenType: 'error'})
    lexer.reset('123foo')
    expect(lexer.next()).toMatchObject({type: 'digits', value: '123'})
    expect(lexer.next()).toMatchObject({type: 'error', value: 'foo', offset: 3})
  })

  test('imply lineBreaks', () => {
    let lexer = compile({
      digits: /[0-9]+/,
      error: moo.error,
    })
    lexer.reset('foo\nbar')
    expect(lexer.next()).toMatchObject({type: 'error', value: 'foo\nbar', lineBreaks: 1})
    expect(lexer.next()).toBe(undefined) // consumes rest of input
  })

  test('may only have one rule', () => {
    expect(() => compile({
      myError: moo.error,
      myError2: moo.error,
    })).toThrow("Multiple error rules not allowed: (for token 'myError2')")
  })

  test('may also match patterns', () => {
    let lexer = compile({
      space: / +/,
      error: { error: true, match: /[`$]/ },
    })
    lexer.reset('foo')
    expect(lexer.next()).toMatchObject({type: 'error', value: 'foo' })
    lexer.reset('$ foo')
    expect(lexer.next()).toMatchObject({type: 'error', value: '$' })
    expect(lexer.next()).toMatchObject({type: 'space', value: ' ' })
    expect(lexer.next()).toMatchObject({type: 'error', value: 'foo' })
  })

  test("don't mess with cloned lexers", () => {
    let lexer = compile({
      digits: /[0-9]+/,
      error: moo.error,
    })
    lexer.reset('123foo')
    let clone = lexer.clone()
    clone.reset('bar')
    expect(lexer.next()).toMatchObject({type: 'digits', value: '123'})
    expect(clone.next()).toMatchObject({type: 'error', value: 'bar'})
    expect(lexer.next()).toMatchObject({type: 'error', value: 'foo'})
    expect(clone.next()).toBe(undefined)
    expect(lexer.next()).toBe(undefined)
  })

})


describe('example: python', () => {

  const pythonLexer = require('./python').lexer

  test('kurt tokens', () => {
    let tokens = lexAll(pythonLexer.reset(fs.readFileSync('test/kurt.py', 'utf-8')))
    expect(tokens.length).toBe(14513)
  })

  test("1 + 2", () => {
    expect(python.outputTokens("1 + 2")).toEqual([
      'NUMBER "1"',
      'OP "+"',
      'NUMBER "2"',
      'ENDMARKER ""',
    ])
  })

  // use non-greedy matching
  test('triple-quoted strings', () => {
    let example = '"""abc""" 1+1 """def"""'
    expect(lexAll(pythonLexer.reset(example)).map(t => t.value)).toEqual(
      ['"""abc"""', " ", "1", "+", "1", " ", '"""def"""']
    )
  })

  test('example python file', () => {
    expect(python.outputTokens(python.pythonFile)).toEqual(python.pythonTokens)
  })

  test("kurt python", () => {
    let tokens = python.outputTokens(fs.readFileSync('test/kurt.py', 'utf-8'))
    expect(tokens).toMatchSnapshot()
    expect(tokens[100]).toBe('NAME "def"')
    expect(tokens.pop()).toBe('ENDMARKER ""')
    tokens.pop()
    expect(tokens.pop()).not.toBe('ERRORTOKEN ""')
  })

})


describe('example: tosh', () => {

  const tosh = require('./tosh')

  test('outputs same as tosh tokenizer', () => {
    let oldTokens = tosh.oldTokenizer(tosh.exampleFile)
    expect(tosh.tokenize(tosh.exampleFile)).toEqual(oldTokens)
  })

})

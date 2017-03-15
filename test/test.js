
const fs = require('fs')

const moo = require('../moo')
const compile = moo.compile
const python = require('./python')


function lexAll(lexer) {
  var tokens = []
  var token
  while ((token = lexer.next())) {
    tokens.push(token)
  }
  return tokens
}



describe('moo compiler', () => {

  test("warns for /g, /y, /i, /m", () => {
    expect(() => compile({ word: /foo/ })).not.toThrow()
    expect(() => compile({ word: /foo/g })).toThrow()
    expect(() => compile({ word: /foo/i })).toThrow()
    expect(() => compile({ word: /foo/y })).toThrow()
    expect(() => compile({ word: /foo/m })).toThrow()
  })

  // TODO warns for multiple capture groups

  // TODO wraps zero capture groups

  // TODO warns if no lineBreaks: true

  test('sorts regexps and strings', () => {
    let lexer = moo.compile({
      tok: [/t[ok]+/, /\w/, 'tok', 'token']
    })
    expect(lexer.re.source.replace(/[(?:)]/g, '')).toBe('token|tok|t[ok]+|\\w')
  })

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

})

describe('capturing groups', () => {

  test('compiles list of capturing RegExps', () => {
    expect(() => moo.compile({
      tok: [/(foo)/, /(bar)/]
    })).not.toThrow()
  })

  test('captures & reports correct size', () => {
    let lexer = moo.compile({
      fubar: /fu(bar)/,
      string: /"(.*?)"/,
      full: /(quxx)/,
      moo: /moo(moo)*moo/,
      space: / +/,
    })
    lexer.reset('fubar "yes" quxx moomoomoomoo')
    let tokens = lexAll(lexer).filter(t => t.type !== 'space')
    expect(tokens.shift()).toMatchObject({ type: 'fubar', value: 'bar', size: 5 })
    expect(tokens.shift()).toMatchObject({ type: 'string', value: 'yes', size: 5 })
    expect(tokens.shift()).toMatchObject({ value: 'quxx', size: 4 })
    expect(tokens.shift()).toMatchObject({ value: 'moo', size: 12 })
  })

})

describe('moo lexer', () => {

  var simpleLexer = compile({
    word: /[a-z]+/,
    number: /[0-9]+/,
    ws: / +/,
  })

  test('vaguely works', () => {
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

  test('accepts a list of regexps', () => {
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

  test('no capture groups', () => {
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

  test('multiline', () => {
    var lexer = compile({
      file: { match: /([^]+)/, lineBreaks: true },
    }).reset('I like to moo\na lot')
    expect(lexer.next().value).toBe('I like to moo\na lot')
  })

  test('match EOL $', () => {
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

  test('match BOL ^', () => {
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

  test('token to string conversion', () => {
    const lexer = compile({
      apples: /()a/,
      pears: /p/,
    }).reset('ap')
    expect(String(lexer.next())).toBe('apples')
    expect(String(lexer.next())).toBe('p')
  })

  // TODO test / design API for errors
  // - check the reported error location

  test('kurt tokens', () => {
    let pythonLexer = compile(python.rules)
    let tokens = lexAll(pythonLexer.reset(fs.readFileSync('test/kurt.py', 'utf-8')))
    expect(tokens.length).toBe(14513)
  })

  // TODO test clone()
})


describe('moo stateful lexer', () => {

  test('switches states', () => {
    const lexer = moo.states({
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

    lexer.reset('one=ab;two=')
    expect(lexAll(lexer).map(({type, value}) => [type, value])).toEqual([
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
    }).feed('`a${{c: d}}e`')
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
    expect(tokens.map(t => t.size)).toEqual([3, 1, 4, 1, 5])
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
    expect(() => compile([['whitespace', /\s+/]])).toThrow()
    expect(() => compile([['multiline', /q[^]*/]])).not.toThrow()
  })

  test('resets state', () => {
    var lexer = compile({
      WS: / +/,
      word: /[a-z]+/,
    })
    lexer.reset('potatoes\nsalad')
    expect(lexer).toMatchObject({buffer: 'potatoes\nsalad', line: 1, col: 1})
    lexAll(lexer)
    expect(lexer).toMatchObject({line: 2, col: 6})
    lexer.reset('cheesecake')
    expect(lexer).toMatchObject({buffer: 'cheesecake', line: 1, col: 1})
  })

  // TODO test clone()
})


describe('save/restore', () => {

  const testLexer = compile({
    word: /[a-z]+/,
    NL: { match: '\n', lineBreaks: true },
  })

  test('can be saved', () => {
    testLexer.reset('one\ntwo')
    lexAll(testLexer)
    expect(testLexer.save()).toEqual({line: 2, col: 4})
  })

  test('can be restored', () => {
    testLexer.reset('\nthree', {line: 2, col: 4})
    expect(testLexer).toMatchObject({line: 2, col: 4, buffer: '\nthree'})
  })

})


describe('python tokenizer', () => {

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
    let pythonLexer = compile(python.rules)
    expect(lexAll(pythonLexer.reset(example)).map(t => t.value)).toEqual(
      ['"""abc"""', " ", "1", "+", "1", " ", '"""def"""']
    )
  })

  test('example python file', () => {
    expect(python.outputTokens(python.pythonFile)).toEqual([
      // 'ENCODING "utf-8"',
      'COMMENT "#!/usr/local/bin/python3"',
      'NL "\\n"',
      'NAME "import"',
      'NAME "sys"',
      'NEWLINE "\\n"',
      'NAME "from"',
      'NAME "tokenize"',
      'NAME "import"',
      'NAME "tokenize"',
      'OP ","',
      'NAME "tok_name"',
      'NEWLINE "\\n"',
      'NAME "import"',
      'NAME "json"',
      'NEWLINE "\\n"',
      'NAME "from"',
      'NAME "io"',
      'NAME "import"',
      'NAME "BytesIO"',
      'NEWLINE "\\n"',
      'NL "\\n"',
      'NAME "path"',
      'OP "="',
      'NAME "sys"',
      'OP "."',
      'NAME "argv"',
      'OP "["',
      'NUMBER "1"',
      'OP "]"',
      'NEWLINE "\\n"',
      'NAME "for"',
      'NAME "info"',
      'NAME "in"',
      'NAME "tokenize"',
      'OP "("',
      'NAME "open"',
      'OP "("',
      'NAME "path"',
      'OP ","',
      'STRING "rb"',
      'OP ")"',
      'OP "."',
      'NAME "readline"',
      'OP ")"',
      'OP ":"',
      'NEWLINE "\\n"',
      'INDENT "    "',
      'NAME "print"',
      'OP "("',
      'NAME "tok_name"',
      'OP "["',
      'NAME "info"',
      'OP "."',
      'NAME "type"',
      'OP "]"',
      'OP ","',
      'NAME "json"',
      'OP "."',
      'NAME "dumps"',
      'OP "("',
      'NAME "info"',
      'OP "."',
      'NAME "string"',
      'OP ")"',
      'OP ")"',
      'NEWLINE "\\n"',
      // 'NL "\\n"',
      'DEDENT ""',
      'ENDMARKER ""',
    ])
  })

  test("kurt python", () => {
    let tokens = python.outputTokens(fs.readFileSync('test/kurt.py', 'utf-8'))
    expect(tokens[100]).toBe('NAME "def"')
    expect(tokens.pop()).toBe('ENDMARKER ""')
    tokens.pop()
    expect(tokens.pop()).not.toBe('ERRORTOKEN ""')
    expect(tokens.length).toBe(11616)

    // let expected = fs.readFileSync('test/kurt-tokens.txt', 'utf-8').split('\n')
    // expect(tokens).toEqual(expected)
  })

})


describe('tosh tokenizer', () => {

  const tosh = require('./tosh')

  test('tosh', () => {
    let oldTokens = tosh.oldTokenizer(tosh.exampleFile)
    expect(tosh.tokenize(tosh.exampleFile)).toEqual(oldTokens)
  })

})

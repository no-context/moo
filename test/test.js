
const fs = require('fs')

const moo = require('../moo')
const compile = moo.compile
const python = require('./python')


describe('moo compiler', () => {

  test("warns for /g, /y, /i, /m", () => {
    expect(() => compile({ word: /foo/ })).not.toThrow()
    expect(() => compile({ word: /foo/g })).toThrow()
    expect(() => compile({ word: /foo/i })).toThrow()
    expect(() => compile({ word: /foo/y })).toThrow()
    expect(() => compile({ word: /foo/m })).toThrow()
  })

  test("handles newline literals", () => {
    // it seems \n doesn't need to be escaped!
    expect(compile({ NL: '\n' }).reset('\n\n').lexAll().map(t => t.type)).toEqual(['NL', 'NL'])
    expect(compile({ NL:  /\n/ }).reset('\n\n').lexAll().map(t => t.type)).toEqual(['NL', 'NL'])
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
    expect(simpleLexer.lex()).toMatchObject({ type: 'word', value: 'ducks' })
    expect(simpleLexer.lex()).toMatchObject({ type: 'ws', value: ' ' })
    expect(simpleLexer.lex()).toMatchObject({ type: 'word', value: 'are' })
  })

  test('accepts rules in an object', () => {
    const lexer = compile({
      word: /[a-z]+/,
      number: /[0-9]+/,
      space: / +/,
    })
    lexer.reset('ducks are 123 bad')
    expect(lexer.lex()).toMatchObject({type: 'word', value: 'ducks'})
    expect(lexer.lex()).toMatchObject({type: 'space', value: ' '})
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
    var tokens = lexer.lexAll().filter(t => t.type !== 'space')
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
    expect(lexer.lex().value).toEqual('aaaaa')
    expect(lexer.lex().value).toEqual('b')
    expect(lexer.lex().value).toEqual('c')
    expect(lexer.lex().value).toEqual('b')
  })

  test('multiline', () => {
    var lexer = compile({
      file: /([^]+)/,
    }).reset('I like to moo\na lot')
    expect(lexer.lex().value).toBe('I like to moo\na lot')
  })

  test('match EOL $', () => {
    var lexer = compile({
      x_eol: /x$/,
      x: /x/,
      WS: / +/,
      NL: /\n/,
      other: /[^ \n]+/,
    }).reset('x \n x\n yz x')
    let tokens = lexer.lexAll().filter(t => t.type !== 'WS')
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
      NL: /\n/,
      other: /[^ \n]+/,
    }).reset('x \n x\nx yz')
    let tokens = lexer.lexAll().filter(t => t.type !== 'WS')
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['x_bol', 'x'],
      ['NL', '\n'],
      ['x', 'x'],
      ['NL', '\n'],
      ['x_bol', 'x'],
      ['other', 'yz'],
    ])
  })

  // TODO test / design API for errors
  // - check the reported error location

  test('kurt tokens', () => {
    let pythonLexer = compile(python.rules)
    let tokens = pythonLexer.reset(fs.readFileSync('test/kurt.py', 'utf-8')).lexAll()
    expect(tokens.length).toBe(14513)
  })

  test('can rewind', () => {
    let lexer = simpleLexer.reset('ducks are 123 bad')
    expect(lexer.lex().toString()).toBe('ducks')
    expect(lexer.lex().toString()).toBe(' ')
    expect(lexer.lex().toString()).toBe('are')
    lexer.rewind(6)
    expect(lexer.lex()).toBe(undefined)
    lexer.feed('lik the bred')
    expect(lexer.lex().toString()).toBe('lik')
  })

  test("won't rewind forward", () => {
    let lexer = simpleLexer.reset('ducks are 123 bad')
    expect(() => lexer.rewind(0)).not.toThrow()
    expect(() => lexer.rewind(1)).toThrow()
    lexer.feed('ducks are 123 bad')
    expect(lexer.lex().toString()).toBe('ducks')
    lexer.rewind(0)
    expect(() => lexer.rewind(1)).toThrow()
  })

  // TODO test clone()
})


describe('moo line lexer', () => {

  var testLexer = moo.lines({
    WS: / +/,
    word: /[a-z]+/,
  })

  test('lexes lines', () => {
    var tokens = testLexer.reset('steak\nsauce\nparty').lexAll()
    expect(tokens.map(t => t.value)).toEqual(['steak', '\n', 'sauce', '\n', 'party'])
    expect(tokens.map(t => t.lineno)).toEqual([1, 1, 2, 2, 3])
    expect(tokens.map(t => t.col)).toEqual([0, 5, 0, 5, 0])
  })

  test('tries to warn if rule matches \\n', () => {
    expect(() => moo.lines([['whitespace', /\s+/]])).toThrow()
    expect(() => moo.lines([['multiline', /q[^]*/]])).not.toThrow()
  })

  test('resets', () => {
    var lexer = moo.lines({
      WS: / +/,
      word: /[a-z]+/,
    })
    lexer.reset('potatoes')
    expect(lexer.lineIndexes).toEqual([-1, 0])
    expect(lexer.lexer.buffer).toBe('potatoes')
    lexer.reset('cheesecake')
    expect(lexer.lineIndexes).toEqual([-1, 0])
    expect(lexer.lexer.buffer).toBe('cheesecake')
  })

  test('can rewind to line', () => {
    var lexer = testLexer
    lexer.reset('steak\nsauce\nparty')
    expect(lexer.lex().value).toBe('steak')
    expect(lexer.lex().value).toBe('\n')
    expect(lexer.lex().value).toBe('sauce')
    lexer.rewindLine(2)
    expect(lexer.lexer.buffer).toBe('steak\n')
    expect(lexer.lex()).toBe(undefined)
    lexer.feed('and\nchips')
    expect(lexer.lexer.buffer).toBe('steak\nand\nchips')
    expect(lexer.lex().value).toBe('and')
    lexer.rewindLine(1)
    expect(lexer.lexer.buffer).toBe('')
    expect(lexer.lex()).toBe(undefined)
  })

  test("can't rewind before line 1", () => {
    var lexer = testLexer
    lexer.reset('cow')
    expect(() => lexer.rewindLine(0)).toThrow()
  })

  test("won't rewind forward", () => {
    var lexer = testLexer.reset('steak\nsauce\nparty')
    expect(() => lexer.rewindLine(1)).not.toThrow()
    expect(() => lexer.rewindLine(2)).toThrow()
    lexer.reset('steak\nsauce\nparty')
    expect(lexer.lex().value).toBe('steak')
    expect(lexer.lex().value).toBe('\n')
    expect(lexer.lex().value).toBe('sauce')
    lexer.rewindLine(1)
    expect(() => lexer.rewindLine(2)).toThrow()
  })

  // TODO test clone()
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
    expect(pythonLexer.reset(example).lexAll().map(t => t.value)).toEqual(
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

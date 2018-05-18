
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

  test('accepts a list of match objects', () => {
    const lexer = compile({
      op: [
        {match: '('},
        {match: ')'},
      ],
    })
    lexer.reset('())(')
    expect(Array.from(lexer).map(x => x.value)).toEqual(['(', ')', ')', '('])
  })

  test('accepts mixed rules and match objects', () => {
    const lexer = compile({
      op: [
        /regexp/,
        'string',
        {match: /something/},
        'lol',
      ],
    })
    expect(lexer.groups.length).toBe(3)
    expect(lexer.reset('string').next()).toMatchObject({type: 'op', value: 'string'})
    expect(lexer.reset('regexp').next()).toMatchObject({type: 'op', value: 'regexp'})
    expect(lexer.reset('something').next()).toMatchObject({type: 'op', value: 'something'})
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

  test('must be strings', () => {
    expect(() => compile({
      identifier: {
        match: /[a-zA-Z]+/,
        keywords: {
          'kw-class': {foo: 'bar'},
        },
      },
    })).toThrow("keyword must be string (in keyword 'kw-class')")
  })

})

describe('value transforms', () => {

  test('forbid capture groups', () => {
    expect(() => moo.compile({
      tok: [/(foo)/, /(bar)/]
    })).toThrow("has capture groups")
  })

  test('transform & keep original', () => {
    let lexer = moo.compile({
      fubar: {match: /fubar/, value: x => x.slice(2)},
      string: {match: /".*?"/, value: x => x.slice(1, -1)},
      full: {match: /quxx/, value: x => x},
      moo: {match: /moo(?:moo)*moo/, value: x => x.slice(3, -3)},
      space: / +/,
    })
    lexer.reset('fubar "yes" quxx moomoomoomoo')
    let tokens = lexAll(lexer).filter(t => t.type !== 'space')
    expect(tokens.shift()).toMatchObject({ type: 'fubar', text: 'fubar', value: 'bar' })
    expect(tokens.shift()).toMatchObject({ type: 'string', text: '"yes"', value: 'yes' })
    expect(tokens.shift()).toMatchObject({ value: 'quxx' })
    expect(tokens.shift()).toMatchObject({ value: 'moomoo' })
  })

  test('empty transform result', () => {
    let lexer = moo.compile({
      string: {match: /".*?"/, value: x => x.slice(1, -1)},
    })
    lexer.reset('""')
    expect(lexer.next()).toMatchObject({text: '""', value: ''})
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
    expect(typeof simpleLexer[Symbol.iterator]).toBe("function")
    expect(typeof simpleLexer[Symbol.iterator]()[Symbol.iterator]).toBe("function")
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
    identifier: /[a-z]+/,
    error: moo.error
  })

  test('supports has()', () => {
    expect(basicLexer.has('identifier')).toBe(true)
  })

  test('works with literals', () => {
    expect(basicLexer.has('keyword')).toBe(true)
  })

  test('finds the error token', () => {
    expect(basicLexer.has('error')).toBe(true)
  })

  test('returns false for nonexistent junk', () => {
    expect(basicLexer.has('random')).toBe(false)
  })

  test('returns false for stuff inherited from Object', () => {
    expect(basicLexer.has('hasOwnProperty')).toBe(false)
  })

  const keywordLexer = compile({
    identifier: {
      match: /[a-zA-Z]+/,
      keywords: {
        'kw-class': 'class',
        'kw-def': 'def',
        'kw-if': 'if',
      },
    },
  })

  test('works with keywords', () => {
    expect(keywordLexer.has('identifier')).toBe(true)
    expect(keywordLexer.has('kw-class')).toBe(true)
  })

  // Example from the readme.
  const statefulLexer = moo.states({
    main: {
      strstart: {match: '`', push: 'lit'},
      ident:    /\w+/,
      lbrace:   {match: '{', push: 'main'},
      rbrace:   {match: '}', pop: true},
      colon:    ':',
      space:    {match: /\s+/, lineBreaks: true},
      mainErr:  moo.error,
    },
    lit: {
      interp:   {match: '${', push: 'main'},
      escape:   /\\./,
      strend:   {match: '`', pop: true},
      const:    {match: /(?:[^$`]|\$(?!\{))+/, lineBreaks: true},
			litErr:   moo.error,
    },
  })

  test('works with multiple states - for first state', () => {
    expect(statefulLexer.has('ident')).toEqual(true)
  })

  test('works with multiple states - for second state', () => {
    expect(statefulLexer.has('interp')).toEqual(true)
  })

	test('works with error tokens - for first state', () => {
		expect(statefulLexer.has('mainErr')).toEqual(true)
	})

	test('works with error tokens - for second state', () => {
		expect(statefulLexer.has('litErr')).toEqual(true)
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
    }).reset('`a${{c: d}}e`')
    expect(lexAll(lexer).map(t => t.type).join(' ')).toBe('strstart const interp lbrace ident colon space ident rbrace rbrace const strend')
  })

  test('warns for non-existent states', () => {
    expect(() => moo.states({start: {bar: {match: 'bar', next: 'foo'}}})).toThrow("Missing state 'foo'")
    expect(() => moo.states({start: {bar: {match: 'bar', push: 'foo'}}})).toThrow("Missing state 'foo'")
    expect(() => moo.states({start: {foo: 'fish', bar: {match: 'bar', push: 'foo'}}})).toThrow("Missing state 'foo'")
  })

  test('warns for non-boolean pop', () => {
    expect(() => moo.states({start: {bar: {match: 'bar', pop: 'cow'}}})).toThrow("pop must be 1 (in token 'bar' of state 'start')")
    expect(() => moo.states({start: {bar: {match: 'bar', pop: 2}}})).toThrow("pop must be 1 (in token 'bar' of state 'start')")
    expect(() => moo.states({start: {bar: {match: 'bar', pop: true}}})).not.toThrow()
    expect(() => moo.states({start: {bar: {match: 'bar', pop: 1}}})).not.toThrow()
    expect(() => moo.states({start: {bar: {match: 'bar', pop: false}}})).not.toThrow()
    expect(() => moo.states({start: {bar: {match: 'bar', pop: 0}}})).not.toThrow()
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
    expect(lexer.save()).toMatchObject({line: 2})
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
      ['abc', " ", "1", "+", "1", " ", 'def']
    )
  })

  test('example python file', () => {
    expect(python.outputTokens(python.pythonFile)).toEqual(python.pythonTokens)
  })

  test("kurt python", () => {
    let tokens = python.outputTokens(fs.readFileSync('test/kurt.py', 'utf-8'))
    expect(tokens).toMatchSnapshot()
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


const { createCategory, matchToken, matchTokens } = moo

describe("createCategory", () => {
  it("works", () => {
    const First = createCategory('First')
    expect(First).toHaveProperty('isCategory', true)
    expect(First).toHaveProperty('categoryName', 'First')
    expect(First).toHaveProperty('categories', null)

    const Second = createCategory('Second', First)
    expect(Second).toHaveProperty('isCategory', true)
    expect(Second).toHaveProperty('categoryName', 'Second')
    expect(Second).toHaveProperty('categories')
    expect(Second.categories).toHaveLength(1)

    const Unrelated = createCategory('Unrelated')
    const Third = createCategory('Third', [Second, Unrelated])
    expect(Third).toHaveProperty('isCategory', true)
    expect(Third).toHaveProperty('categoryName', 'Third')
    expect(Third).toHaveProperty('categories')
    expect(Third.categories).toHaveLength(3)
  })

  it("doesn't allow non-categories", () => {
    expect(() => {
      createCategory('First', 'stuff')
    }).toThrow()
  })
})

describe("matchToken", () => {
  const Punctuation = createCategory('Punctuation')
  const Paren = createCategory('Paren', Punctuation)

  const lexer = compile({
    Dot: { match: '.', categories: Punctuation },
    LeftParen: { match: '(', categories: Paren },
    Space: / +/,
  })

  const { Dot, LeftParen, Space } = lexer.tokenLibrary()

  lexer.reset(".( ")
  const tokens = Array.from(lexer)
  const [DotToken, LeftParenToken, SpaceToken] = tokens

  it("works in the singular form", () => {
    expect(matchToken(DotToken, Dot)).toBe(true)
    expect(matchToken(LeftParenToken, LeftParen)).toBe(true)
    expect(matchToken(SpaceToken, Space)).toBe(true)

    expect(matchToken(DotToken, LeftParen)).toBe(false)
    expect(matchToken(DotToken, Space)).toBe(false)

    expect(matchToken(LeftParenToken, Dot)).toBe(false)
    expect(matchToken(LeftParenToken, Space)).toBe(false)

    expect(matchToken(SpaceToken, Dot)).toBe(false)
    expect(matchToken(SpaceToken, LeftParen)).toBe(false)


    expect(matchToken(DotToken, Punctuation)).toBe(true)
    expect(matchToken(DotToken, Paren)).toBe(false)

    expect(matchToken(LeftParenToken, Punctuation)).toBe(true)
    expect(matchToken(LeftParenToken, Paren)).toBe(true)

    expect(matchToken(SpaceToken, Punctuation)).toBe(false)
    expect(matchToken(SpaceToken, Paren)).toBe(false)
  })

  it("works in the plural form", () => {
    expect(matchTokens(tokens, [Dot, LeftParen, Space])).toBe(true)

    expect(matchTokens(tokens, [Punctuation, Punctuation, Space])).toBe(true)

    expect(matchTokens(tokens, [Punctuation, Paren, Space])).toBe(true)

    expect(matchTokens(tokens, [Dot, Punctuation, Space])).toBe(true)

    expect(matchTokens(tokens, [Dot, Paren, Space])).toBe(true)


    expect(matchTokens(tokens, [Space, Dot, LeftParen])).toBe(false)

    expect(matchTokens(tokens, [Paren, Paren, Paren])).toBe(false)

    expect(matchTokens(tokens, [Punctuation, Punctuation, Punctuation])).toBe(false)

    expect(matchTokens(tokens, [Dot, Dot, Dot])).toBe(false)
  })
})



describe("categories", () => {
  const Punctuation = createCategory('Punctuation')
  const Paren = createCategory('Paren', Punctuation)

  const Exclamatory = createCategory('Exclamatory')

  const noKeywordLexer = compile({
    Dot: { match: '.', categories: Punctuation },
    BangParen: { match: '!()', categories: [Paren, Exclamatory] },
    LeftParen: { match: '(', categories: Paren },
    RightParen: { match: ')', categories: Paren },
    Exclaim: { match: '!', categories: [Punctuation, Exclamatory] },
    Space: / +/,
  })

  const tok = noKeywordLexer.tokenLibrary()

  it("has a complete tokenLibrary when there are no keywords", () => {
    expect(tok).toContainAllKeys(['Dot', 'BangParen', 'LeftParen', 'RightParen', 'Exclaim', 'Space'])
  })

  it("gives all tokenLibrary items the correct categories", () => {
    const { Dot, BangParen, LeftParen, RightParen, Exclaim, Space } = tok

    expect(Dot).toHaveProperty('categories')
    expect(Dot.categories).toBeInstanceOf(Array)
    expect(Dot.categories).toIncludeAllMembers(['Punctuation'])

    expect(BangParen).toHaveProperty('categories')
    expect(BangParen.categories).toBeInstanceOf(Array)
    expect(BangParen.categories).toIncludeAllMembers(['Punctuation', 'Paren', 'Exclamatory'])

    expect(LeftParen).toHaveProperty('categories')
    expect(LeftParen.categories).toBeInstanceOf(Array)
    expect(LeftParen.categories).toIncludeAllMembers(['Punctuation', 'Paren'])

    expect(RightParen).toHaveProperty('categories')
    expect(RightParen.categories).toBeInstanceOf(Array)
    expect(RightParen.categories).toIncludeAllMembers(['Punctuation', 'Paren'])

    expect(Exclaim).toHaveProperty('categories')
    expect(Exclaim.categories).toBeInstanceOf(Array)
    expect(Exclaim.categories).toIncludeAllMembers(['Punctuation', 'Exclamatory'])

    expect(Space).toHaveProperty('categories', null)
  })

  it("are given correctly to lexed tokens", () => {
    noKeywordLexer.reset(".!()()! ")
    const tokens = Array.from(noKeywordLexer)
    expect(tokens).toHaveLength(6)

    const [
      DotToken, BangParenToken, LeftParenToken, RightParenToken, ExclaimToken, SpaceToken
    ] = tokens

    expect(DotToken).toHaveProperty('categories')
    expect(DotToken.categories).toBeInstanceOf(Array)
    expect(DotToken.categories).toIncludeAllMembers(['Punctuation'])

    expect(BangParenToken).toHaveProperty('categories')
    expect(BangParenToken.categories).toBeInstanceOf(Array)
    expect(BangParenToken.categories).toIncludeAllMembers(['Punctuation', 'Paren', 'Exclamatory'])

    expect(LeftParenToken).toHaveProperty('categories')
    expect(LeftParenToken.categories).toBeInstanceOf(Array)
    expect(LeftParenToken.categories).toIncludeAllMembers(['Punctuation', 'Paren'])

    expect(RightParenToken).toHaveProperty('categories')
    expect(RightParenToken.categories).toBeInstanceOf(Array)
    expect(RightParenToken.categories).toIncludeAllMembers(['Punctuation', 'Paren'])

    expect(ExclaimToken).toHaveProperty('categories')
    expect(ExclaimToken.categories).toBeInstanceOf(Array)
    expect(ExclaimToken.categories).toIncludeAllMembers(['Punctuation', 'Exclamatory'])

    expect(SpaceToken).toHaveProperty('categories', null)
  })

  it("works correctly with matchToken", () => {
    noKeywordLexer.reset(".!()()! ")
    const tokens = Array.from(noKeywordLexer)
    expect(tokens).toHaveLength(6)

    const [
      DotToken, BangParenToken, LeftParenToken, RightParenToken, ExclaimToken, SpaceToken
    ] = tokens
    const { Dot, BangParen, LeftParen, RightParen, Exclaim, Space } = tok

    expect(matchToken(DotToken, Dot)).toBe(true)
    expect(matchToken(BangParenToken, BangParen)).toBe(true)
    expect(matchToken(LeftParenToken, LeftParen)).toBe(true)
    expect(matchToken(RightParenToken, RightParen)).toBe(true)
    expect(matchToken(ExclaimToken, Exclaim)).toBe(true)
    expect(matchToken(SpaceToken, Space)).toBe(true)

    expect(matchToken(DotToken, Punctuation)).toBe(true)
    expect(matchToken(DotToken, Paren)).toBe(false)
    expect(matchToken(DotToken, Exclamatory)).toBe(false)

    expect(matchToken(BangParenToken, Punctuation)).toBe(true)
    expect(matchToken(BangParenToken, Paren)).toBe(true)
    expect(matchToken(BangParenToken, Exclamatory)).toBe(true)

    expect(matchToken(LeftParenToken, Punctuation)).toBe(true)
    expect(matchToken(LeftParenToken, Paren)).toBe(true)
    expect(matchToken(LeftParenToken, Exclamatory)).toBe(false)

    expect(matchToken(RightParenToken, Punctuation)).toBe(true)
    expect(matchToken(RightParenToken, Paren)).toBe(true)
    expect(matchToken(RightParenToken, Exclamatory)).toBe(false)

    expect(matchToken(ExclaimToken, Punctuation)).toBe(true)
    expect(matchToken(ExclaimToken, Paren)).toBe(false)
    expect(matchToken(ExclaimToken, Exclamatory)).toBe(true)

    expect(matchToken(SpaceToken, Punctuation)).toBe(false)
    expect(matchToken(SpaceToken, Paren)).toBe(false)
    expect(matchToken(SpaceToken, Exclamatory)).toBe(false)
  })
})


describe("keywords", () => {
  const IdentifierCategory = createCategory('IdentifierCategory')
  const Keyword = createCategory('Keyword')
  const Html = createCategory('Html', Keyword)

  const Exclamatory = createCategory('Exclamatory')

  const Numeric = createCategory('Numeric')

  const keywordLexer = compile({
    Identifier: { match: /[a-z]+/, categories: IdentifierCategory, keywords: [
      { type: 'Null', values: ['null'] },
      { type: 'ControlFlowKeyword', values: ['while', 'for'], categories: Keyword },
      { type: 'HtmlTag', values: ['div', 'span'], categories: Html },
      { type: 'Scary', values: ['argh'], categories: [Keyword, Exclamatory] },
    ]},
    Num: { match: /[0-9]+/, categories: Numeric, keywords: {
      ScaryNum: '666',
      NiceNum: '000',
    }},
    Dots: { match: /\.+/, keywords: [
      { type: 'ScaryDots', values: ['...'], categories: Exclamatory }
    ]},
    Bangs: { match: /\!+/, keywords: { ThreeBang: '!!!' }},
    Space: / +/,
  })

  const tok = keywordLexer.tokenLibrary()

  it("work with both new syntaxes, and are added to the tokenLibrary", () => {
    expect(tok).toContainAllKeys(['Identifier', 'Null', 'ControlFlowKeyword', 'HtmlTag', 'Scary', 'Num', 'ScaryNum', 'NiceNum', 'Dots', 'ScaryDots', 'Bangs', 'ThreeBang', 'Space'])

    const {
      Identifier, Null, ControlFlowKeyword, HtmlTag, Scary, Num, ScaryNum, NiceNum, Dots, ScaryDots, Bangs, ThreeBang, Space
    } = tok

    expect(Identifier).toHaveProperty('categories')
    expect(Identifier.categories).toBeInstanceOf(Array)
    expect(Identifier.categories).toIncludeAllMembers(['IdentifierCategory'])

    expect(Null).toHaveProperty('categories')
    expect(Null.categories).toBeInstanceOf(Array)
    expect(Null.categories).toIncludeAllMembers(['IdentifierCategory'])

    expect(ControlFlowKeyword).toHaveProperty('categories')
    expect(ControlFlowKeyword.categories).toBeInstanceOf(Array)
    expect(ControlFlowKeyword.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword'])

    expect(HtmlTag).toHaveProperty('categories')
    expect(HtmlTag.categories).toBeInstanceOf(Array)
    expect(HtmlTag.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword', 'Html'])

    expect(Scary).toHaveProperty('categories')
    expect(Scary.categories).toBeInstanceOf(Array)
    expect(Scary.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword', 'Exclamatory'])

    expect(Num).toHaveProperty('categories')
    expect(Num.categories).toBeInstanceOf(Array)
    expect(Num.categories).toIncludeAllMembers(['Numeric'])

    expect(ScaryNum).toHaveProperty('categories')
    expect(ScaryNum.categories).toBeInstanceOf(Array)
    expect(ScaryNum.categories).toIncludeAllMembers(['Numeric'])

    expect(NiceNum).toHaveProperty('categories')
    expect(NiceNum.categories).toBeInstanceOf(Array)
    expect(NiceNum.categories).toIncludeAllMembers(['Numeric'])

    expect(Dots).toHaveProperty('categories', null)

    expect(ScaryDots).toHaveProperty('categories')
    expect(ScaryDots.categories).toBeInstanceOf(Array)
    expect(ScaryDots.categories).toIncludeAllMembers(['Exclamatory'])

    expect(Bangs).toHaveProperty('categories', null)

    expect(ThreeBang).toHaveProperty('categories', null)

    expect(Space).toHaveProperty('categories', null)
  })

  it("are given correctly to lexed tokens", () => {
    keywordLexer.reset("iden null for div argh 1 666 000 . ... ! !!! ")

    const tokens = Array.from(keywordLexer)
    expect(tokens).toHaveLength(24)

    const [
      IdentifierToken, , NullToken, , ControlFlowKeywordToken, , HtmlTagToken, , ScaryToken, , NumToken, , ScaryNumToken, , NiceNumToken, , DotsToken, ,ScaryDotsToken, , BangsToken, , ThreeBangToken, SpaceToken
    ] = tokens

    expect(IdentifierToken).toHaveProperty('categories')
    expect(IdentifierToken.categories).toBeInstanceOf(Array)
    expect(IdentifierToken.categories).toIncludeAllMembers(['IdentifierCategory'])

    expect(NullToken).toHaveProperty('categories')
    expect(NullToken.categories).toBeInstanceOf(Array)
    expect(NullToken.categories).toIncludeAllMembers(['IdentifierCategory'])

    expect(ControlFlowKeywordToken).toHaveProperty('categories')
    expect(ControlFlowKeywordToken.categories).toBeInstanceOf(Array)
    expect(ControlFlowKeywordToken.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword'])

    expect(HtmlTagToken).toHaveProperty('categories')
    expect(HtmlTagToken.categories).toBeInstanceOf(Array)
    expect(HtmlTagToken.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword', 'Html'])

    expect(ScaryToken).toHaveProperty('categories')
    expect(ScaryToken.categories).toBeInstanceOf(Array)
    expect(ScaryToken.categories).toIncludeAllMembers(['IdentifierCategory', 'Keyword', 'Exclamatory'])

    expect(NumToken).toHaveProperty('categories')
    expect(NumToken.categories).toBeInstanceOf(Array)
    expect(NumToken.categories).toIncludeAllMembers(['Numeric'])

    expect(ScaryNumToken).toHaveProperty('categories')
    expect(ScaryNumToken.categories).toBeInstanceOf(Array)
    expect(ScaryNumToken.categories).toIncludeAllMembers(['Numeric'])

    expect(NiceNumToken).toHaveProperty('categories')
    expect(NiceNumToken.categories).toBeInstanceOf(Array)
    expect(NiceNumToken.categories).toIncludeAllMembers(['Numeric'])

    expect(DotsToken).toHaveProperty('categories', null)

    expect(ScaryDotsToken).toHaveProperty('categories')
    expect(ScaryDotsToken.categories).toBeInstanceOf(Array)
    expect(ScaryDotsToken.categories).toIncludeAllMembers(['Exclamatory'])

    expect(BangsToken).toHaveProperty('categories', null)

    expect(ThreeBangToken).toHaveProperty('categories', null)

    expect(SpaceToken).toHaveProperty('categories', null)
  })
})

describe("ignore", () => {
  it("works as expected", () => {
    const ignoringLexer = compile({
      Dot: '.',
      Bang: '!',
      Space: { match: / +/, ignore: true },
    })

    const { Dot, Bang, Space } = ignoringLexer.tokenLibrary()

    ignoringLexer.reset(" . ! . ")
    const tokens = Array.from(ignoringLexer)
    expect(tokens).toHaveLength(3)
    expect(matchTokens(tokens, [Dot, Bang, Dot])).toBe(true)
  })
})

const fs = require('fs')
const vm = require('vm')

const moo = require('../moo')
const compile = moo.compile
const python = require('./python')

function lexAll(lexer) {return Array.from(lexer)}


describe('compiler', () => {

  test('handles empty rule set', () => {
    const lex = compile({})
    lex.reset('nope!')
    expect(() => lex.next()).toThrow('invalid syntax')

    const lex2 = compile({err: moo.error})
    lex2.reset('nope!')
    expect(lex2.next()).toMatchObject({type: 'err', text: 'nope!'})

    const lex3 = moo.states({main: {}})
    lex3.reset('nope!')
    expect(() => lex3.next()).toThrow('invalid syntax')

    const lex4 = moo.states({main: {err: moo.error}})
    lex4.reset('nope!')
    expect(lex4.next()).toMatchObject({type: 'err', text: 'nope!'})
  })

  test("warns for /g, /y, /i, /m", () => {
    expect(() => compile({ word: /foo/ })).not.toThrow()
    expect(() => compile({ word: /foo/g })).toThrow('implied')
    expect(() => compile({ word: /foo/i })).toThrow('not allowed')
    expect(() => compile({ word: /foo/y })).toThrow('implied')
    expect(() => compile({ word: /foo/m })).toThrow('implied')
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

  test('accepts multiple fast rules in states', () => {
    const states = {
      main: {
        a: 'a',
        b: 'b'
      }
    }
    expect(() => moo.states(states)).not.toThrow()
  })

  test('accepts RegExps from other contexts', () => {
    const lexer = moo.compile({
      word: vm.runInNewContext(/\w+/),
    })
    lexer.reset('ducks')
    expect(lexer.next()).toMatchObject({type: 'word', value: 'ducks'})
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
      { type: 'keyword', match: 'Bob'},
      { type: 'word', match: /[a-z]+/},
      { type: 'number', match: /[0-9]+/},
      { type: 'space', match: / +/},
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

  test('escapes strings', () => {
    let lexer = moo.compile({
      tok1: '-/\\^$*+',
      tok2: ['?.()|[]{}', 'cow'],
    })
    lexer.reset('-/\\^$*+?.()|[]{}')
    expect(lexer.next()).toMatchObject({value: '-/\\^$*+'})
    expect(lexer.next()).toMatchObject({value: '?.()|[]{}'})
  })

  test('sorts RegExps and strings', () => {
    let lexer = moo.compile({
      tok: [/t[ok]+/, /\w/, 'foo', 'token']
    })
    expect(lexer.re.source.replace(/[(?:)]/g, '').replace(/\|$/, ''))
    .toMatch('token|foo|t[ok]+|\\w')
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

  test("but doesn't sort literals across rules", () => {
    let lexer = moo.compile({
      one: 'moo',
      two: 'moomintroll',
    })
    lexer.reset('moomintroll')
    expect(lexer.next()).toMatchObject({value: 'moo'})
  })

})

describe('fallback tokens', () => {

  test('work', () => {
    const lexer = moo.compile({
      op: /[._]/,
      text: moo.fallback,
    })
    lexer.reset('.this_that.')
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'text', value: 'this'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '_'})
    expect(lexer.next()).toMatchObject({type: 'text', value: 'that'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
  })

  test(`work if there are characters before the first token`, () => {
    const lexer = compile({
      op: /[._]/,
      text: moo.fallback,
    })
    lexer.reset('.stuff')
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'text', value: 'stuff'})
  })

  test(`work if there are characters after the last token`, () => {
    const lexer = compile({
      op: /[._]/,
      text: moo.fallback,
    })
    lexer.reset('stuff.')
    expect(lexer.next()).toMatchObject({type: 'text', value: 'stuff'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
  })

  test('work on stateful lexers', () => {
    const lexer = moo.states({
      main: {
        op: /[._]/,
        switch: {match: '|', next: 'other'},
        text: moo.fallback,
      },
      other: {
        op: /[+-]/,
      },
    })
    lexer.reset('foo.bar_baz|++-!')
    expect(lexer.next()).toMatchObject({type: 'text', value: 'foo'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'text', value: 'bar'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '_'})
    expect(lexer.next()).toMatchObject({type: 'text', value: 'baz'})
    expect(lexer.next()).toMatchObject({type: 'switch', value: '|'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '+'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '+'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '-'})
    expect(() => lexer.next()).toThrow('invalid syntax')
  })

  test(`are never empty`, () => {
    const lexer = moo.compile({
      op: /[._]/,
      text: moo.fallback,
    })
    lexer.reset('.._._')
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '_'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '.'})
    expect(lexer.next()).toMatchObject({type: 'op', value: '_'})
  })

  test(`report token positions correctly`, () => {
    const lexer = moo.compile({
      op: /[._]/,
      text: moo.fallback,
    })
    lexer.reset('.this_th\nat.')
    expect(lexer.next()).toMatchObject({value: '.', offset: 0})
    expect(lexer.next()).toMatchObject({value: 'this', offset: 1})
    expect(lexer.next()).toMatchObject({value: '_', offset: 5})
    expect(lexer.next()).toMatchObject({value: 'th\nat', offset: 6})
    expect(lexer.next()).toMatchObject({value: '.', offset: 11})
  })

  test(`report token line numbers correctly`, () => {
    const lexer = moo.compile({
      str: {lineBreaks: true, match: /"[^]+?"/},
      bare: moo.fallback,
    })
    lexer.reset('a\nb"some\nthing" else\ngoes\nhere\n\n"\nand here"\n')
    expect(lexer.next()).toMatchObject({value: 'a\nb', line: 1, col: 1})
    expect(lexer.next()).toMatchObject({value: '"some\nthing"', line: 2, col: 2})
    expect(lexer.next()).toMatchObject({value: ' else\ngoes\nhere\n\n', line: 3, col: 7})
    expect(lexer.next()).toMatchObject({value: '"\nand here"', line: 7, col: 1})
    expect(lexer.next()).toMatchObject({value: '\n', line: 8, col: 10})
  })

  test("don't throw token errors until next() is called again", () => {
    const lexer = moo.compile({
      op: {match: /[._]/, shouldThrow: true},
      text: moo.fallback,
    })
    lexer.reset('stuff.')
    expect(lexer.next()).toMatchObject({type: 'text', value: 'stuff'})
    expect(() => lexer.next()).toThrow('invalid syntax')
  })

  test('disables fast single-character matching', () => {
    const lexer = moo.compile({
      fast: '.',
      text: moo.fallback,
    })
    lexer.reset('foo.bar')
    expect(Array.from(lexer).map(x => x.value)).toEqual(['foo', '.', 'bar'])
    expect(lexer.fast).toEqual({})
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
      identifier: {match: /[a-zA-Z]+/, type: moo.keywords({keyword: 'class'})},
    }))
    check(compile({
      identifier: {match: /[a-zA-Z]+/, type: moo.keywords({keyword: ['class']})},
    }))
  })

  test('keywords can have individual tokenTypes', () => {
    let lexer = compile({
      identifier: {
        match: /[a-zA-Z]+/,
        type: moo.keywords({
          'kw-class': 'class',
          'kw-def': 'def',
          'kw-if': 'if',
        }),
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
        type: moo.keywords({
          'kw-class': {foo: 'bar'},
        }),
      },
    })).toThrow("keyword must be string (in keyword 'kw-class')")
  })

})

describe('type transforms', () => {

  test('can use moo.keywords as type', () => {
    let lexer = compile({
      identifier: {
        match: /[a-zA-Z]+/,
        type: moo.keywords({
          'kw-class': 'class',
          'kw-def': 'def',
          'kw-if': 'if',
        }),
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

  test('type can be a function', () => {
    let lexer = compile({
      identifier: {
        match: /[a-zA-Z]+/,
        type: () => 'moo',
      },
    })
    lexer.reset('baa')
    expect(lexer.next()).toMatchObject({ type: 'moo' })
  })

  test('supports case-insensitive keywords', () => {
    const caseInsensitiveKeywords = map => {
      const transform = moo.keywords(map)
      return text => transform(text.toLowerCase())
    }
    let lexer = compile({
      space: ' ',
      identifier: {
        match: /[a-zA-Z]+/,
        type: caseInsensitiveKeywords({
          keyword: ['moo'],
        }),
      },
    })
    lexer.reset('mOo')
    expect(lexer.next()).toMatchObject({ type: 'keyword', value: 'mOo' })
    lexer.reset('cheese')
    expect(lexer.next()).toMatchObject({ type: 'identifier', value: 'cheese'})
  })

  test('cannot set type to a string', () => {
    expect(() => compile({
      identifier: {
        type: 'moo',
      },
    })).toThrow("Type transform cannot be a string (type 'moo' for token 'identifier')")
  })

  test('can be used in an array', () => {
    const lexer = compile([
      { type: (name) => 'word-' + name, match: /[a-z]+/},
      { type: 'space', match: / +/},
    ])
    lexer.reset('foo ')
    expect(lexer.next()).toMatchObject({type: 'word-foo', value: 'foo'})
    expect(lexer.next()).toMatchObject({type: 'space', value: ' '})
  })

  test('may result in questionable errors', () => {
    const myTransform = function() {}
    expect(() => compile([
      { type: myTransform, next: 'moo'},
    ])).toThrow("State-switching options are not allowed in stateless lexers (for token 'function () {}')")
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
      name: {match: /[a-z]/, type: moo.keywords({ kw: ['m'] })},
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

  test('returns true even for nonexistent junk', () => {
    expect(basicLexer.has('random')).toBe(true)
  })

  const keywordLexer = compile({
    identifier: {
      match: /[a-zA-Z]+/,
      type: moo.keywords({
        'kw-class': 'class',
        'kw-def': 'def',
        'kw-if': 'if',
      }),
    },
  })

  test("returns true even for keywords", () => {
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

})


describe('stateful lexer', () => {

  const statefulLexer = moo.states({
    start: {
      word: /\w+/,
      eq: {match: '=', next: 'ab'},
      myError: moo.error,
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

  test('supports errors', () => {
    statefulLexer.reset('foo!')
    expect(lexAll(statefulLexer).map(({type, value}) => [type, value])).toEqual([
      ['word', 'foo'],
      ['myError', '!'],
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
      eq: {match: '=', push: 'ab'},
    },
    ab: {
      a: 'a',
      b: 'b',
      semi: {match: ';', push: 'start'},
    },
  })

  test('can save state', () => {
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

  test('can save stack', () => {
    statefulLexer.reset('one=a;')
    statefulLexer.next() // one
    statefulLexer.next() // =
    expect(statefulLexer.save()).toMatchObject({stack: ['start']})
    statefulLexer.next() // a
    statefulLexer.next() // ;
    expect(statefulLexer.save()).toMatchObject({stack: ['start', 'ab']})
  })

  test('can restore stack', () => {
    statefulLexer.reset('one=a;', { stack: ['one', 'two'], state: 'ab' })
    expect(statefulLexer.state).toBe('ab')
    expect(statefulLexer.stack).toEqual(['one', 'two'])
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
      "1  123\n" +
      "2  456baa\n" +
      "      ^"
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
      "1  abc\n" +
      "2  def\n" +
      "3  g 12\n" +
      "    ^\n" +
      "4  345\n" +
      "5  6"
    )
  })

  test('can format null at EOF', () => {
    let lexer = compile({
      ws: {match: /\s/, lineBreaks: true},
      word: /[a-z]+/,
    })
    lexer.reset('abc\ndef quxx')
    expect(Array.from(lexer).length).toBe(5)
    expect(lexer.line).toBe(2)
    expect(lexer.col).toBe(9)
    expect(lexer.formatError(undefined, "EOF!")).toBe(
      "EOF! at line 2 col 9:\n\n" +
      "1  abc\n" +
      "2  def quxx\n" +
      "           ^"
    )
  })

  test('can format null even not at EOF', () => {
    let lexer = compile({
      ws: {match: /\s/, lineBreaks: true},
      word: /[a-z]+/,
    })
    lexer.reset('abc\ndef quxx\nbar')
    lexer.next()
    lexer.next()
    expect(lexer.line).toBe(2)
    expect(lexer.col).toBe(1)
    expect(lexer.formatError(undefined, "oh no!")).toBe(
      "oh no! at line 2 col 1:\n\n" +
      "1  abc\n" +
      "2  def quxx\n" +
      "   ^\n" +
      "3  bar"
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
    })).toThrow("Multiple error rules not allowed (for token 'myError2')")
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

describe('include', () => {

  test('handles fast matching', () => {
    const l = moo.states({
      main: {
        "{": "{",
        include: 'shared',
      },
      shared: {
        '*': '*',
        word: /[a-z]+/,
      }
    })

    l.reset("{foo*")
    Array.from(l)
  })

  test('handles multiple states with same fast match', () => {
    const l = moo.states({
      main: {
        include: 'shared',
        "{": {match: "{", push: "inner"},
      },
      inner: {
        "}": {match: "}", pop: 1},
        include: 'shared',
      },
      shared: {
        '*': '*',
        word: /[a-z]+/,
      },
      x: 1,
    })

    l.reset("foo{bar*}")
    Array.from(l)
  })

  test('handles cycles', () => {
    const lexer = moo.states({
      $all: {
        ws: { match: /\s+/, lineBreaks: true },
      },
      a: {
        a: /a\w/,
        switch: { match: '|', next: 'b' },
        include: 'b',
      },
      b: {
        b: /\wb/,
        switch: { match: '|', next: 'a' },
        include: 'a',
      },
    })

    lexer.reset('ab ac bb ac cb | ab ac bb ac cb')
    expect(Array.from(lexer)
      .filter(tok => tok.type !== "ws")
      .map(tok => tok.type + " " + tok.value))
      .toEqual([
        "a ab",
        "a ac",
        "b bb",
        "a ac",
        "b cb",
        "switch |",
        "b ab",
        "a ac",
        "b bb",
        "a ac",
        "b cb",
      ])
  })

  test('JS example', () => {
    const lexer = moo.states({
      $all: { err: moo.error },
      main: {
        include: 'std',
      },
      brace: {
        include: 'std',
        rbrace: { match: '}', pop: 1 },
      },
      template: {
        include: 'std',
        tmid: { match: /}(?:\\[^]|[^\\`])*?\${/, value: s => s.slice(1, -2) },
        tend: { match: /}(?:\\[^]|[^\\`])*?`/, value: s => s.slice(1, -1), pop: 1 },
      },
      std: {
        include: ['comment', 'ws'],
        id: /[A-Za-z]\w*/,
        op: /[!=]==|\+[+=]?|-[-=]|<<=?|>>>?=?|&&?|\|\|?|[<>!=/*&|^%]=|[~!,/*^?:%]/,
        tbeg: { match: /`(?:\\[^]|[^\\`])*?\${/, value: s => s.slice(1, -2), push: 'template' },
        tsim: { match: /`(?:\\[^]|[^\\`])*?`/, value: s => s.slice(1, -1) },
        str: { match: /'(?:\\[^]|[^\\'])*?'|"(?:\\[^]|[^\\"])*?"/, value: s => s.slice(1, -1) },
        lbrace: { match: '{', push: 'brace'},
      },
      ws: {
        ws: { match: /\s+/, lineBreaks: true },
      },
      comment: {
        lc: /\/\/.+/,
        bc: /\/\*[^]*?\*\//,
      },
    })

    lexer.reset('`just ` + /* comment */ // line\n`take ${one} and ${a}${two} and a` + {three: `${{four: five}}}`} / "six"')
    expect(Array.from(lexer)
      .filter(tok => tok.type !== "ws")
      .map(tok => tok.type + " " + tok.value))
      .toEqual([
         "tsim just ",
         "op +",
         "bc /* comment */",
         "lc // line",
         "tbeg take ",
         "id one",
         "tmid  and ",
         "id a",
         "tmid ",
         "id two",
         "tend  and a",
         "op +",
         "lbrace {",
         "id three",
         "op :",
         "tbeg ",
         "lbrace {",
         "id four",
         "op :",
         "id five",
         "rbrace }",
         "tend }",
         "rbrace }",
         "op /",
         "str six",
      ])
  })
})

describe('unicode flag', () => {
  test('allows all rules to be /u', () => {
    expect(() => compile({a: /foo/u, b: /bar/u, c: 'quxx'})).not.toThrow()
    expect(() => compile({a: /foo/u, b: /bar/, c: 'quxx'})).toThrow(
      'If one rule is /u then all must be'
    )
    expect(() => compile({a: /foo/, b: /bar/u, c: 'quxx'})).toThrow(
      'If one rule is /u then all must be'
    )
  })

  test('unicode rules work with fallback token', () => {
    expect(() =>
      compile({a: moo.fallback, b: /bar/u, c: /quxx/u})
    ).not.toThrow()
  })

  test("supports unicode", () => {
    const lexer = compile({
      a: /[𝌆]/u,
    })
    lexer.reset("𝌆")
    expect(lexer.next()).toMatchObject({value: "𝌆"})
    lexer.reset("𝌆".charCodeAt(0))
    expect(() => lexer.next()).toThrow()

    const lexer2 = compile({
      a: /\u{1D356}/u,
    })
    lexer2.reset("𝍖")
    expect(lexer2.next()).toMatchObject({value: "𝍖"})
    lexer2.reset("\\u{1D356}")
    expect(() => lexer2.next()).toThrow()
  })

})

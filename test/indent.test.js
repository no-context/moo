
const fs = require('fs')

const moo = require('../moo')
const indented = require('../indent')
const compile = moo.compile

describe('indent', () => {

  test("example", () => {

    const base = moo.compile({
      ws: /[ \t]+/,
      nl: { match: /(?:\r\n?|\n)+/, lineBreaks: true },
      id: /\w+/,
    })

    const lexer = indented(base, {
      ignoreNewline: true,
    })

    lexer.reset(`
    if this
      if that
        another
    else
      there
    `)

    const output = Array.from(lexer)
    //for (const tok of output) console.log(tok)
    expect(output).toMatchSnapshot()

  })

})

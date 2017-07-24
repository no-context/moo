
const fs = require('fs')

const moo = require('../moo')
const indented = require('../indent')
const compile = moo.compile

describe('indent', () => {

  test("example", () => {

    const lexer = moo.compile({
      ws: /[ \t]+/,
      nl: { match: /(?:\r\n?|\n)+/, lineBreaks: true },
      id: /\w+/,
    })

    const tokens = indented(lexer, `
    if this
      if that
        another
    else
      there
    `)

    const output = Array.from(tokens)
    //for (const tok of output) console.log(tok)
    expect(output).toMatchSnapshot()

  })

})

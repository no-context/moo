
module.exports = function lexer(source) {
  var index = 0

  function bail() {
    throw new SyntaxError('Unexpected token ' + source[index] + ' in JSON at position ' + index)
  }

  function expect(what) {
    var ch = source[index]
    if (ch !== what) { bail() }
    index++
  }

  var line = 1
  var colIndex

  function next() {
    var ws
    if (ws = space()) {
      return {type: 'space', value: ws}
    }
    if (index === source.length) { return }
    var ch = source[index]
    switch (ch) {
      case '{': index++; return {type: '{', value: ch}
      case '}': index++; return {type: '}', value: ch}
      case '[': index++; return {type: '[', value: ch}
      case ']': index++; return {type: ']', value: ch}
      case ',': index++; return {type: ',', value: ch}
      case ':': index++; return {type: ':', value: ch}
      case '"':
        return {type: 'STRING', value: string()}
      case '-': case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
        return {type: 'NUMBER', value: number()}
      case 't': index++
        expect('r')
        expect('u')
        expect('e')
        return {type: 'TRUE'}
      case 'f': index++
        expect('a')
        expect('l')
        expect('s')
        expect('e')
        return {type: 'FALSE'}
      case 'n': index++
        expect('u')
        expect('l')
        expect('l')
        return {type: 'NULL'}
    }
    bail()
  }

  function space() {
    var space = ''
    var ch = source[index]
    while (ch === ' ' || ch === '\t' || ch === '\n') {
      if (ch === '\n') {
        line++
        colIndex = index
      }
      space += ch
      ch = source[++index]
    }
    return space
  }

  function string() {
    var s = ''
    var ch
    while ((ch = source[++index]) !== '"') {
      switch (ch) {
        case '\\':
          ch = source[++index]
          switch (ch) {
            case 'n': s += '\n'; continue
            case 'b': s += '\b'; continue
            case 'f': s += '\f'; continue
            case 'r': s += '\r'; continue
            case 't': s += '\t'; continue
            case 'u':
              var charCode = parseInt(source.substring(index, 4))
              if (isNaN(charCode)) {
                throw new SyntaxError("Invalid Unicode escape sequence")
              }
              s += String.fromCharCode(charCode)
              continue
            case '"':
            default:
              s += ch; continue
          }
        default:
          s += ch
      }
    }
    index++
    return s
  }

  function number() {
    var n = ''
    if (source[index] === '-') {
      n = '-'
      index++
    }
    var d
    n += (d = digit())
    if (!d) bail()
    if (d !== '0') {
      while (d = digit()) {
        n += d
      }
    }
    var ch = source[index]
    if (ch === '.') {
      n += '.'
      index++
      n += (d = digit())
      if (!d) bail()
      while (d = digit()) {
        n += d
      }
    }
    var ch = source[index]
    if (ch === 'e' || ch === 'E') {
      bail() // TODO
    }
    return parseFloat(n)
  }

  function digit() {
    var ch = source[index]
    switch (ch) {
      case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
        index++
        return ch
    }
    return
  }

  function nextToken() {
    var tok = next()
    if (tok) {
      tok.line = line
      tok.col = index - colIndex + 1
    }
    return tok
  }

  return nextToken
}

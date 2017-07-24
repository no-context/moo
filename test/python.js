
const moo = require('../moo')
const indented = require('../indent')


function assert(x) {
  if (!x) throw "Assertion failed!";
}

function raise(name, message) {
  throw err(name, message);
}

function err(name, message) {
  // TODO ?
  return name + ': ' + message;
}


var opPat = [
  // operators
  ',',':', '.', ';', '@', '->',
  '+=','-=', '*=', '/=', '//=', '%=', '@=',
  '&=','|=', '^=', '>>=', '<<=', '**=',

  // delimiters
  '+','-', '**', '*', '//', '/', '%', // '@',
  '<<','>>', '<=', '>=', '==', '!=',
  '&','|', '^', '~',
  '<','>',

  // another operator
  '=',
];

var rules = {
  Whitespace: /[ ]+/, // TODO tabs
  NAME: /[A-Za-z_][A-Za-z0-9_]*/,
  OP: [
    {match: ['(', '[', '{'], push: 'paren'},
    {match: [')', ']', '}'], pop: 1},
    opPat,
  ],
  COMMENT: /#.*/,
  // TODO "unexpected character after line continuation character"
  Continuation: {match: /\\(?:\r|\r\n|\n)/, lineBreaks: true}, // Continuation
  ERRORTOKEN: {match: /[\$?`]/, error: true},
  // TODO literals: str, long, float, imaginary
  NUMBER: [
    /(?:[0-9]+(?:\.[0-9]+)?e-?[0-9]+)/, // 123[.123]e[-]123
    /(?:(?:0|[1-9][0-9]*)?\.[0-9]+)/,   // [123].123
    /(?:(?:0|[1-9][0-9]*)\.[0-9]*)/,    // 123.[123]
    /(?:0|[1-9][0-9]*)/,              // 123
  ],
  STRING: [
    {match: /"""[^]*?"""/, lineBreaks: true, value: x => x.slice(3, -3)},
    {match: /"(?:\\["\\rn]|[^"\\\n])*?"/, value: x => x.slice(1, -1)},
    {match: /'(?:\\['\\rn]|[^'\\\n])*?'/, value: x => x.slice(1, -1)},
  ],
}

var base = moo.states({
  start: Object.assign({}, rules, {
    NEWLINE: {match: /\r|\r\n|\n/, lineBreaks: true},
  }),
  paren: Object.assign({}, rules, {
    NL: {match: /\r|\r\n|\n/, lineBreaks: true},
  }),
})

var pythonLexer = indented(base, {
  whitespace: 'Whitespace',
  newline: 'NEWLINE',
  indent: 'INDENT',
  dedent: 'DEDENT',
  comment: 'COMMENT',
  // TODO: Continuations shouldn't emit INDENT
})


var tokenize = function(input, emit) {
  var lexer = pythonLexer.reset(input);

  var parens = 0
  var isLine = false
  var tok
  while (tok = lexer.next()) {

    switch (tok.type) {
      case 'COMMENT':
        emit(tok)
        tok = lexer.next()
        if (tok.type === 'NEWLINE') tok.type = 'NL'
        break
      case 'Continuation':
        continue
      case 'NEWLINE':
        if (parens) {
          tok.type = 'NL'
        } else if (isLine) {
          tok.type = 'NEWLINE'
          isLine = false
        } else {
          tok.type = 'NL'
        }
        break
      case 'OP':
        if (/[([{]/.test(tok.value[0])) {
          parens++
        } else if (/[)\]}]/.test(tok.value[0])) {
          parens = Math.max(0, parens - 1)
        }
        // FALL-THRU
      default:
        isLine = true
    }
    emit(tok)
  }
  emit({type: 'ENDMARKER', value: ''})
}


function outputTokens(source) {
  var tokens = [];
  tokenize(source, function emit(token) {
    tokens.push(token.type + ' ' + JSON.stringify(token.value));
  });
  return tokens;
}

let pythonFile = `#!/usr/local/bin/python3
import sys
from tokenize import tokenize, tok_name
import json
from io import BytesIO

path = sys.argv[1]
for info in tokenize(open(path, 'rb').readline):
    print(tok_name[info.type], json.dumps(info.string))
`

let pythonTokens = [
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
  'INDENT ""',
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
]

module.exports = {
  tokenize,
  outputTokens,
  pythonFile,
  pythonTokens,
  lexer: pythonLexer,
}


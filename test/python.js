var moo = require('../moo')


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
  '(',')', '[', ']', '{', '}',
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

var pythonLexer = moo.compile({
  Whitespace: /[ ]+/, // TODO tabs
  NAME: /[A-Za-z_][A-Za-z0-9_]*/,
  OP: opPat,
  COMMENT: /#.*/,
  NEWLINE: { match: /\r|\r\n|\n/, lineBreaks: true },
  Continuation: /\\/,
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
})


var tokenize = function(input, emit) {
  var lexer = pythonLexer.reset(input);
  var lex = function() { return lexer.next(); }

  var tok = lex();
  var last;
  var peeked;
  function next() {
    if (peeked) {
      peeked = null;
      return peeked;
    }
    last = tok;
    tok = lex();
  }
  function peek() {
    return peeked = lex();
    // return peeked ? peeked : peeked = lex();
  }

  var stack = [];
  var currentIndent = 0;

  while (tok) {
    var indent = 0;
    var indentation = '';
    if (tok.type === 'Whitespace' && (!last || last.type === 'NEWLINE' || last.type === 'NL')) {
      indentation = tok.value;
      indent = indentation.length;
      next();
    }
    if (tok.type === 'COMMENT') {
      // TODO encoding declarations
      emit(tok);
      next();
      // assert tok.type === 'NEWLINE' ?
    }
    if (tok.type === 'NEWLINE') {
      tok.type = 'NL';
      emit(tok);
      next();
      continue;
    }

    var parenlev = 0;
    var isLine = true;
    while (tok && isLine) {
      switch (tok.type) {
        case 'Whitespace':
          next();
          continue;
        case 'Continuation':
          next();
          if (tok.type === 'NEWLINE') {
            next();
          }
          continue;
        case 'NEWLINE':
          if (parenlev) {
            // implicit line continuation
            tok.type = 'NL';
          } else {
            isLine = false;
          }
          emit(tok);
          next();
          break;
        case 'OP':
          if (/[([{]/.test(tok.value[0])) {
            parenlev++;
          } else if (/[)\]}]/.test(tok.value[0])) {
            parenlev = Math.max(0, parenlev - 1);
          }
          // fall-thru
        default:
          if (indent !== null) {
            // emit INDENT or DEDENT
            if (indent > currentIndent) {
              stack.push(currentIndent);
              currentIndent = indent;
              emit({ type: 'INDENT', value: indentation });
            } else {
              while (indent < currentIndent) {
                currentIndent = stack.pop();
                emit({ type: 'DEDENT', value: '' });
              }
              if (indent > currentIndent) {
                throw err('IndentationError', "unindent does not match any outer indentation level");
              }
            }
            indent = null;
          }
          emit(tok);
          next();
      }
    }
  }

  while (currentIndent) {
    currentIndent = stack.pop();
    emit({ type: 'DEDENT', value: '' });
  }
  emit({ type: 'ENDMARKER', value: '' });
};

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
]

module.exports = {
  tokenize,
  outputTokens,
  pythonFile,
  pythonTokens,
  lexer: pythonLexer,
}


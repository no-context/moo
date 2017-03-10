var brickface = require('../brickface')


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
  '+','-', '**', '*', '//', '/', '%', '@',
  '<<','>>', '<=', '>=', '==', '!=',
  '&','|', '^', '~',
  '<','>',

  // another operator
  '=',
];

var TOKENS = [
  ['Whitespace', /([ ]+)/], // TODO tabs
  ['NAME', /([A-Za-z_][A-Za-z0-9_]*)/],
  ['OP', opPat],
  ['COMMENT', /(#.*)/],
  ['NEWLINE', /\r|\r\n|\n/],
  ['Continuation', /\\/],

  ['ERRORTOKEN', /[$?`]/],

  // TODO literals: str, long, float, imaginary

  ["NUMBER", /(?:[0-9]+(?:\.[0-9]+)?e-?[0-9]+)/], // 123[.123]e[-]123
  ["NUMBER", /(?:(?:0|[1-9][0-9]*)?\.[0-9]+)/],   // [123].123
  ["NUMBER", /(?:(?:0|[1-9][0-9]*)\.[0-9]*)/],    // 123.[123]
  ["NUMBER", /(?:0|[1-9][0-9]*)/],              // 123

  ["STRING", /"""(.*)"""/],
  ["STRING", /"((?:\\["\\rn]|[^"\\])*)"/], // strings are backslash-escaped
  ["STRING", /'((?:\\['\\rn]|[^'\\])*)'/],

];

var Token = brickface.Token;
var factory = brickface.compile(TOKENS);

var tokenize = function(input, emit) {
  var lexer = factory(input);
  var lex = function() { return lexer.lex(); }

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
    if (tok.name === 'Whitespace' && (!last || last.name === 'NEWLINE' || last.name === 'NL')) {
      indentation = tok.value;
      indent = indentation.length;
      next();
    }
    if (tok.name === 'COMMENT') {
      // TODO encoding declarations
      emit(tok);
      next();
      // assert tok.name === 'NEWLINE' ?
    }
    if (tok.name === 'NEWLINE') {
      tok.name = 'NL';
      emit(tok);
      next();
      continue;
    }

    var parenlev = 0;
    var isLine = true;
    while (tok && isLine) {
      switch (tok.name) {
        case 'Whitespace':
          next();
          continue;
        case 'Continuation':
          next();
          if (tok.name === 'NEWLINE') {
            next();
          }
          continue;
        case 'NEWLINE':
          if (parenlev) {
            // implicit line continuation
            tok.name = 'NL';
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
              emit(new Token('INDENT', indentation));
            } else {
              while (indent < currentIndent) {
                currentIndent = stack.pop();
                emit(new Token('DEDENT'));
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
    emit(new Token('DEDENT'));
  }
  emit(new Token('ENDMARKER'));
};

function outputTokens(source) {
  var tokens = [];
  tokenize(source, function emit(token) {
    tokens.push(token.name + ' ' + JSON.stringify(token.value));
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

module.exports = {
  tokenize,
  outputTokens,
  pythonFile,
  rules: TOKENS,
}



const moo = require('../moo')

let toshLexer = moo.compile([
  {type: 'symbol',  match: Array.from('-%#+*/=^,?')},  // single character
  {type: 'WS',      match: /[ \t]+/},
  {type: 'ellips',  match: /\.{3}/},
  {type: 'comment', match: /\/{2}.*$/},
  {type: 'false',   match: /\<\>/},
  {type: 'zero',    match: /\(\)/},
  {type: 'empty',   match: /_(?: |$)/},
  {type: 'number',  match: /[0-9]+(?:\.[0-9]+)?e-?[0-9]+/}, // 123[.123]e[-]123
  {type: 'number',  match: /(?:0|[1-9][0-9]*)?\.[0-9]+/},   // [123].123
  {type: 'number',  match: /(?:0|[1-9][0-9]*)\.[0-9]*/},    // 123.[123]
  {type: 'number',  match: /0|[1-9][0-9]*/},              // 123
  {type: 'color',   match: /#(?:[A-Fa-f0-9]{3}){2}/},
  {type: 'string',  match: /"(?:\\["\\]|[^\n"\\])*"/}, // strings are backslash-escaped
  {type: 'string',  match: /'(?:\\['\\]|[^\n'\\])*'/},
  {type: 'lparen',  match: /\(/},
  {type: 'rparen',  match: /\)/},
  {type: 'langle',  match: /\</},
  {type: 'rangle',  match: /\>/},
  {type: 'lsquare', match: /\[/},
  {type: 'rsquare', match: /\]/},
  {type: 'cloud',   match: /[☁]/},
  {type: 'input',   match: /%[a-z](?:\.[a-zA-Z]+)?/},
  {type: 'symbol',  match: /[_A-Za-z][-_A-Za-z0-9:',.]*/}, // word, as in a block
  {type: 'iden',    match: /[^\n \t"'()<>=*\/+-]+/},     // user-defined type
  {type: 'NL',      match: /\n/, lineBreaks: true },
  {type: 'ERROR',   error: true},
])

function tokenize(source) {
  let lexer = toshLexer.reset(source + '\n')
  let tokens = []
  for (let tok of lexer) {
    if (tok.type !== 'WS') {
      if (tok.type === 'string') {
        tok.value = tok.value.slice(1, tok.value.length - 1)
      }
      tokens.push([tok.type, tok.value])
    }
  }
  return tokens
}


var oldTokenizer = function() {

  var Token = function(kind, text, value) {
    this.kind = kind;
    this.text = text;
    this.value = value;
  };

  Token.prototype.toString = function() {
    var args = [this.kind, this.text, this.value];
    return "Token(" + args.map(JSON.stringify).join(", ") + ")";
  };

  Token.prototype.isEqual = function(other) {
    return this.kind === other.kind && this.value === other.value;
  };

  function getValue(token) {
    return token.value;
  }


  // TODO should we allow () as an empty number input slot?

  var TOKENS = [
    ['ellips',  /\.{3}/],
    ['comment', /\/{2}(.*)$/],
    ['false',   /\<\>/],
    ['zero',    /\(\)/],
    ['empty',   /_( |$)/],
    ['number',  /([0-9]+(\.[0-9]+)?e-?[0-9]+)/], // 123[.123]e[-]123
    ['number',  /((0|[1-9][0-9]*)?\.[0-9]+)/],   // [123].123
    ['number',  /((0|[1-9][0-9]*)\.[0-9]*)/],    // 123.[123]
    ['number',  /(0|[1-9][0-9]*)/],              // 123
    ['color',   /#([A-Fa-f0-9]{3}(?:[A-Fa-f0-9]{3})?)/],
    ['string',  /"((\\["\\]|[^"\\])*)"/], // strings are backslash-escaped
    ['string',  /'((\\['\\]|[^'\\])*)'/],
    ['lparen',  /\(/],   ['rparen',  /\)/],
    ['langle',  /\</],   ['rangle',  /\>/],
    ['lsquare', /\[/],   ['rsquare', /\]/],
    ['cloud',   /[☁]/],
    ['input',   /%[a-z](?:\.[a-zA-Z]+)?/],
    ['symbol',  /[-%#+*/=^,?]/],                // single character
    ['symbol',  /[_A-Za-z][-_A-Za-z0-9:',.]*/], // word, as in a block
    ['iden',    /[^ \t"'()<>=*\/+-]+/],     // user-defined names
  ];

  var backslashEscapeSingle = /(\\['\\])/g;
  var backslashEscapeDouble = /(\\["\\])/g;

  var whitespacePat = /^(?:[ \t]+|$)/;
  var eolPat = /(.*)[ \t]*/;

  var tokenize = function(input) {
    var remain = input;

    // consume whitespace
    var leadingWhitespace = '';
    var m = whitespacePat.exec(input);
    if (m) {
      leadingWhitespace = m[0];
      remain = remain.slice(m[0].length);
    }

    var tokens = [];
    var sawWhitespace = true;
    var expectedWhitespace = false;
    while (remain) {
      var kind = null;
      for (var i=0; i<TOKENS.length; i++) {
        var kind_and_pat = TOKENS[i],
            kind = kind_and_pat[0],
            pat  = kind_and_pat[1];
        var m = pat.exec(remain);
        if (m && m.index == 0) {
          var text = m[0];
          var value = m[1] === undefined ? m[0] : m[1];
          break;
        }
      }
      if (i === TOKENS.length) {
        tokens.push(new Token('error', remain, "Unknown token"));
        return tokens;
      }

      if (expectedWhitespace && text.length > 1) {
        // Both us and the previous token expected to see whitespace between us.
        // If there wasn't any, error.
        if (!sawWhitespace) {
          tokens.push(new Token('error', remain, "Expected whitespace"));
          return tokens;
        }
      }

      // consume token text
      remain = remain.slice(text.length);

      // consume whitespace
      var m = whitespacePat.exec(remain);
      sawWhitespace = Boolean(m);
      if (m) {
        remain = remain.slice(m[0].length);
        text += m[0];
      }
      if (kind === 'empty') sawWhitespace = true;

      // 'iden' adds onto the preceding 'symbol'
      if (kind === 'iden' && tokens.length) {
        var lastToken = tokens[tokens.length - 1];
        if (lastToken.kind === 'symbol' && !/[ \t]$/.test(lastToken.text)) {
          lastToken.text += text;
          lastToken.value += value;
          lastToken.kind = 'iden';
          expectedWhitespace = true;
          continue;
        }
      }

      // the first token gets the leading whitespace
      if (tokens.length === 0) {
        text = leadingWhitespace + text;
      }

      // push the token
      tokens.push(new Token(kind, text, value));

      expectedWhitespace = (text.length > 1);
    }
    return tokens;
  };

  return function(source) {
    var tokens = []
    source.split('\n').forEach(line => {
      tokens = tokens.concat(tokenize(line).map(x => [x.kind, x.value]))
      tokens.push(['NL', '\n'])
    })
    return tokens
  }

}()


let exampleFile = `when flag clicked
set vx to 0
set vy to 0
set vz to 0
set x var to 100
set y var to 100
set z var to 240
forever
	if mouse down? then
		set dx to mouse x / (240 / pancake z) - x var
		set dy to mouse y / (240 / pancake z) - y var
		set dist to sqrt of (dx * dx + dy * dy)
		change vx by dx / dist
		change vy by dy / dist
	end
	set vx to 0.95 * vx
	set vy to 0.95 * vy
	change vz by 1
	if z var > pancake z then
		set z var to pancake z
		if vz > 0 then
			set vz to -26
		end
		broadcast "splat"
	end
	change x var by vx
	change y var by vy
	change z var by vz
	set factor to 240 / z var
	go to x: x var * factor y: y var * factor
	set size to 60 * factor%
end

when I receive "hide pusheen"
hide

when I receive "show pusheen"
show`


module.exports = {
  tokenize,
  oldTokenizer,
  exampleFile,
}



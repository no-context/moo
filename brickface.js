(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory)
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.BrickFace = factory()
  }
}(this, function() {

  function reEscape(s) {
    return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
  function reGroups(s) {
    var re = new RegExp('|' + s);
    return re.exec('').length - 1;
  }
  function reCapture(s) {
    return s + '()';
  }
  function reUnion(prefix, regexps, flags) {
    var source =  regexps.map(function(s) {
      return "(?:" + s + ")";
    }).join('|');
    return new RegExp(prefix + "(?:" + source + ")", flags);
  }
  function reLiterals(literals) {
    return new RegExp('(' + literals.map(reEscape).join('|') + ')');
  }


  var Token = function(name, value) {
    this.name = name;
    this.value = value || '';
  };

  Token.prototype.toString = function() {
    switch (this.name) {
      case 'NAME':
      case 'OP':
      case 'ERRORTOKEN':
        return this.value;
      case 'NEWLINE':
      case 'ENDMARKER':
      default:
        return this.name;
    }
    return 'token' + this.name;
  };


  var NamedGroup = function(name, isCapture, regexp) {
    this.name = name;
    this.isCapture = isCapture;
    this._regexp = regexp; // for troubleshooting
  };


  var Lexer = function(tokens) {
    this.parts = [];
    this.groups = [];
    this.regexp = /^/;

    for (var i=0; i<tokens.length; i++) {
      var tok = tokens[i];
      this.addRule(tok[0], tok[1]);
    }

    this.scope = [];
  };

  Lexer.prototype.addRule = function(name, re) {
    // convert string literal to RegExp
    var re = re instanceof RegExp ? re.source : reEscape(re);

    // validate
    if (new RegExp(re).test("")) {
      throw new Error("Token regexp matches empty string: " + re);
    }

    // store named group
    var groupCount = reGroups(re);
    if (groupCount > 1) {
      throw new Error("Token regexp has more than one capture group: " + re);
    }
    var isCapture = !!groupCount;
    this.groups.push(new NamedGroup(name, isCapture, re));

    // store regex
    if (!isCapture) re = reCapture(re);
    this.parts.push(re);
    this.regexp = reUnion('', this.parts, 'g');
  };

  Lexer.prototype.save = function() {
    this.scope.push({
      parts: this.parts.slice(),
      groups: this.groups.slice(),
      regexp: this.regexp,
    });
  };

  Lexer.prototype.restore = function() {
    if (!this.scope.length) {
      throw "Can't restore";
    }
    var old = this.scope.pop();
    this.parts = old.parts;
    this.groups = old.groups;
    this.regexp = old.regexp;
  };

  Lexer.prototype.tokenize = function(readline) {
    var regexp = this.regexp;
    var groups = this.groups;
    var groupCount = groups.length;
    var width;
    var queue = [];

    var readline = readline;
    var line;

    function next() {
      line = readline();
      if (line === null) return;
      width = line.length;
      regexp.lastIndex = 0;
    }
    next();

    return function lex() {
      if (queue.length) {
        return queue.shift();
      }
      if (regexp.lastIndex === width) {
        next();
        if (line === null) {
          return; // EOF
        }
      }

      var start = regexp.lastIndex;
      var match = regexp.exec(line);
      if (!match) {
        regexp.lastIndex = width;
        return new Token('ERRORTOKEN', line.slice(start));
      }
      if (match.index > start) { // skipped chars
        queue.push(new Token('ERRORTOKEN', line.slice(start, match.index)));
      }
      // assert match.length === this.groups.length + 1
      // assert match[0].length
      // assert regexp.lastIndex === match.index + match[0].length

      // which group matched?
      var group = null;
      for (var i = 0; i < groupCount; i++) {
        var value = match[i + 1];
        if (value !== undefined) {
          group = groups[i];
          break;
        }
      } if (i === groupCount) {
        throw "Assertion failed";
      }

      var text = group.isCapture ? value : match[0];
      var token = new Token(group.name, text);
      //console.log('-', token.name, start);
      if (token.name === 'Whitespace' && start === 0) {
        token.name = 'Indentation';
      }

      if (queue.length) {
        queue.push(token);
        return queue.pop();
      }
      return token;
    }
  }


  function stringReadlines(source) {
    var length = source.length;
    var index = 0;

    return function readline() {
      if (index === length) {
        return null; // EOF
      }
      var start = index;
      var tok = source[index];
      while (tok) {
        if (tok === '\r') {
          index++;
          if (tok === '\n') {
            index++;
          }
          break;
        }
        if (tok === '\n') {
          index++;
          break;
        }
        tok = source[++index];
      }
      var line = source.slice(start, index);
      //console.log(JSON.stringify(line));
      return line;
    }
  }


  return {
    Lexer: Lexer,
    Token: Token,
    stringReadlines: stringReadlines,
    reLiterals: reLiterals,
  };

}))

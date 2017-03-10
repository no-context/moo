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
  function reUnion(prefix, regexps) {
    var source =  regexps.map(function(s) {
      return "(?:" + s + ")";
    }).join('|');
    return new RegExp(prefix + "(?:" + source + ")");
  }


  var Token = function(symbol, text) {
    this.symbol = symbol;
    this.text = text;
  };

  Token.prototype.toString = function() {
    return this.symbol;
  };


  var NamedGroup = function(name, isCapture, regexp) {
    this.name = name;
    this.isCapture = isCapture;
    this._regexp = regexp; // for debugging
  };



  var Tokenizer = function(tokens) {
    var parts = [];
    var groups = [];
    for (var index = 0; index < tokens.length; index++) {
      var token = tokens[index];
      if (typeof token === 'string') {
        token = [token, token];
      }
      var name = token[0],
          re = token[1];

      // convert string literal to RegExp
      re = re instanceof RegExp ? re.source : reEscape(re);

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
      groups.push(new NamedGroup(name, isCapture, re));

      // store regex
      if (!isCapture) re = reCapture(re);
      console.log(re);
      parts.push(re);
    }
    this.regexp = reUnion('^', parts);
    this.groups = groups;
    this._parts = parts;
  };

  Tokenizer.prototype.tokenize = function(source) {
    var regexp = this.regexp;
    var groups = this.groups;
    var tokens = [];
    var remaining = source;

    while (remaining.length) {
      var match = regexp.exec(remaining);
      // assert match.length === this.groups.length + 1

      // check we parsed all of source
      if (!match) {
        throw new Error("Could not tokenize: " + remaining);
      }

      // which group matched?
      var group = null;
      for (var index = 0; index < groups.length; index++) {
        var value = match[index + 1];
        if (value !== undefined) {
          group = groups[index];
          break;
        }
      } if (index === groups.length) {
        throw new Error("this should never happen");
      }

      // check we didn't skip some of the input
      if (match.index > 0) {
        var offending = remaining.slice(0, match.index);
        throw new Error("Could not tokenize: " + offending); 
      }

      // make token
      var text = match[0];
      var symbol = group.isCapture ? value : group.name + "Token";
      var token = new Token(symbol, text);
      tokens.push(token);

      var symbol = group.name + "Token";
      if (group.isCapture) symbol = value + symbol;

      // consume input
      remaining = remaining.slice(text.length);
    }

    return tokens;
  };

}))

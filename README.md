![](cow.png)

Moo!
====

Moo is a highly-optimised tokenizer/lexer generator. Use it to tokenize your stuff, before parsing it with a parser like [nearley](https://github.com/hardmath123/nearley) or whatever else you're into.

Define your tokens **using regular expressions**. Moo will compile 'em down to a **single RegExp for performance**. It uses the new ES6 **sticky flag** where possible to make things faster; otherwise it falls back to an almost-as-efficient workaround. (For more than you ever wanted to know about this, read [adventures in the land of substrings and RegExps](http://mrale.ph/blog/2016/11/23/making-less-dart-faster.html).)


![](cow.png)

Moo!
====

Moo is a highly-optimised tokenizer/lexer generator. Use it to tokenize your strings, before parsing 'em with a parser like [nearley](https://github.com/hardmath123/nearley) or whatever else you're into.

Define your tokens **using regular expressions**. Moo will compile 'em down to a **single RegExp for performance**. It uses the new ES6 **sticky flag** where possible to make things faster; otherwise it falls back to an almost-as-efficient workaround. (For more than you ever wanted to know about this, read [adventures in the land of substrings and RegExps](http://mrale.ph/blog/2016/11/23/making-less-dart-faster.html).)

Oh, and it [avoids parsing RegExps by itself](https://hackernoon.com/the-madness-of-parsing-real-world-javascript-regexps-d9ee336df983#.2l8qu3l76). Because that would be horrible.


Is it fast?
-----------

Yup! Flying-cows-and-singed-steak fast.

It's about **~10x faster** than most of the other JS tokenizers I can find. It's about **2x faster** than a naïve RegExp-based tokenizer.

You can go faster still by writing your lexer by hand, but that's icky.


Usage
-----

First, you need to do the needful: ~~`$ npm install moo`, `$ yarn install moo`, or whatever will ship this code to your computer~~ _Hold up a second; we haven't published to NPM yet!_ Alternatively, grab the `moo.js` file by itself and slap it into your web page via a `<script>` tag; it's completely standalone.

Then you can start roasting your very own lexer/tokenizer:

```js
    const moo = require('moo')

    let factory = moo([
      ['WS',      /[ \t]+/],
      ['comment', /\/\/.*?$/],
      ['number',  /(0|[1-9][0-9]*)/],
      ['string',  /"((?:\\["\\]|[^\n"\\])*)"/],
      ['lparen',  '('],
      ['rparen',  ')'],
      ['keyword', ['while', 'if', 'else', 'moo', 'cows']],
      ['NL',      /\n/],
    ])
```

And now throw some text at it:

```js
    let lexer = factory('while (10) cows\nmoo')
    lexer.lex() // -> { name: 'keyword', value: 'while' }
    lexer.lex() // -> { name: 'WS', value: ' ' }
    lexer.lex() // -> { name: 'lparen', value: '(' }
    lexer.lex() // -> { name: 'number', value: '10' }
    // ...
```

You can also feed it chunks of input at a time:

```j
    let lexer = factory()
    lexer.feed('while')
    lexer.feed(' 10 cows\n')
    // ...
```

If you've reached the end of moo's internal buffer, lex() will return `undefined`. You can always feed() it more if that happens.

**Errors:** if no token matches, at the moment you get an `ERRORTOKEN` containing the rest of the input. Better error handling is a work-in-progress.


On Regular Expressions
----------------------

RegExps are nifty for making tokenizers, but they can be a bit of a pain. Here are some things to be aware of:

* You often want to use **non-greedy quantifiers**: e.g. `*?` instead of `*`. Otherwise your tokens will be longer than you expect:

```js
    let factory = moo([
      ['string', /".*"/],   // greedy quantifier *
      // ...
    ])
    // ...
    lexer.lex() // -> { name: 'string', value: '"foo" "bar"' }
```

* The **order of your rules** matters. Earlier ones will take precedence.

```js
    moo([
        ['word',  /[a-z]+/],
        ['foo',   'foo'],
    ])('foo').lexAll() // -> [{ name: 'word', value: 'foo' }]

    moo([
        ['foo',   'foo'],
        ['word',  /[a-z]+/],
    ])('foo').lexAll() // -> [{ name: 'foo', value: 'foo' }]
```

* Moo uses **multiline RegExps**. This has a few quirks: for example, `/./` doesn't include newlines. Use `[^]` instead if you want this.

* Since excluding capture groups like `/[^ ]/` (no spaces) _will_ include newlines, you have to be careful not to include them by accident! In particular, the whitespace metacharacter `\s` includes newlines.


Questions
---------

* **What about Streams?**

    A Stream API would be nice. If you want such a thing, let us know and send a Pull Request!

* **What about states?**

    Some tokenizers (flex?) support different states. We're thinking of adding such a thing once we hear a use case for it. :-)


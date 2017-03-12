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

    let lexer = moo.compile({
      WS:      /[ \t]+/,
      comment: /\/\/.*?$/,
      number:  /(0|[1-9][0-9]*)/,
      string:  /"((?:\\["\\]|[^\n"\\])*)"/,
      lparen:  '(',
      rparen:  ')',
      keyword: ['while', 'if', 'else', 'moo', 'cows'],
      NL:      { match: /\n/, lineBreaks: true },
    })
```

And now throw some text at it:

```js
    lexer.reset('while (10) cows\nmoo')
    lexer.next() // -> { type: 'keyword', value: 'while' }
    lexer.next() // -> { type: 'WS', value: ' ' }
    lexer.next() // -> { type: 'lparen', value: '(' }
    lexer.next() // -> { type: 'number', value: '10' }
    // ...
```

You can also feed it chunks of input at a time:

```j
    lexer.reset()
    lexer.feed('while')
    lexer.feed(' 10 cows\n')
    lexer.next() // -> { type: 'keyword', value: 'while' }
    // ...
```

If you've reached the end of moo's internal buffer, next() will return `undefined`. You can always feed() it more if that happens.

**Errors:** if no token matches, at the moment you get an `ERRORTOKEN` containing the rest of the input. Better error handling is a work-in-progress.


On Regular Expressions
----------------------

RegExps are nifty for making tokenizers, but they can be a bit of a pain. Here are some things to be aware of:

* You often want to use **non-greedy quantifiers**: e.g. `*?` instead of `*`. Otherwise your tokens will be longer than you expect:

    ```js
    let lexer = moo.compile({
      string: /"(.*)"/,   // greedy quantifier *
      // ...
    })
    lexer.reset('"foo" "bar"')
    // ...
    lexer.next() // -> { type: 'string', value: 'foo" "bar' }
    ```
    
    Better:
    
    ```js
    let lexer = moo.compile({
      string: /"(.*?)"/,   // non-greedy quantifier *?
      // ...
    })
    // ...
    lexer.next() // -> { type: 'string', value: 'foo' }
    lexer.next() // -> { type: 'string', value: 'bar' }
    ```

* The **order of your rules** matters. Earlier ones will take precedence.

    ```js
    moo.compile({
        word:  /[a-z]+/,
        foo:   'foo',
    }).reset('foo').lexAll() // -> [{ type: 'word', value: 'foo' }]

    moo.compile({
        foo:   'foo',
        word:  /[a-z]+/,
    }).reset('foo').lexAll() // -> [{ type: 'foo', value: 'foo' }]
    ```

* Moo uses **multiline RegExps**. This has a few quirks: for example, `/./` doesn't include newlines. Use `[^]` instead if you want this.

* Since excluding capture groups like `/[^ ]/` (no spaces) _will_ include newlines, you have to be careful not to include them by accident! In particular, the whitespace metacharacter `\s` includes newlines.


Keywords
--------

Moo makes it convenient to define literals and keywords:

```js
      // ...
      ['lparen',  '('],
      ['rparen',  ')'],
      ['keyword', ['while', 'if', 'else', 'moo', 'cows']],
      // ...
```

It'll automatically compile them into regular expressions, escaping them where necessary.

**Important!**: moo also special-cases keywords to ensure the **longest match** principle applies, even in edge cases.

Imagine trying to parse the input `className` with the following rules:

      ['keyword',     ['class']],
      ['identifier',  /[a-zA-Z]+/],

You'll get _two_ tokens — `['class', 'Name']` -- which is _not_ what you want! If you swap the order of the rules, you'll fix this example; but now you'll lex `class` wrong (as an `identifier`).

Moo solves this by checking to see if any of your literals can be matched by one of your other rules; if so, it doesn't lex the keyword separately, but instead handles it at a later stage (by checking identifiers against a list of keywords). So you should always do this:

```js
    ['while', 'if', 'else', 'moo', 'cows']
```

and **not** this:

```js
    /while|if|else|moo|cows/
```


States
------

Sometimes you want your lexer to support different states. This is useful for string interpolation, for example: to tokenize `a${{c: d}}e`:

```js
    let lexer = moo.states({
      main: {
        strstart: {match: '`', push: 'lit'},
        ident:    /\w+/,
        lbrace:   {match: '{', push: 'main'},
        rbrace:   {match: '}', pop: 1},
        colon:    ':',
        space:    {match: /\s+/, lineBreaks: true},
      },
      lit: {
        interp:   {match: '${', push: 'main'},
        escape:   /\\./,
        strend:   {match: '`', pop: 1},
        const:    {match: /(?:[^$`]|\$(?!\{))+/, lineBreaks: true},
      },
    })
    // <= `a${{c: d}}e`
    // => strstart const interp lbrace ident colon space ident rbrace rbrace const strend
```

It's also nice to let states inherit rules from other states and be able to count things, e.g. the interpolated expression state needs a `}` rule that can tell if it's a closing brace or the end of the interpolation, but is otherwise identical to the normal expression state.

To support this, moo allows annotating tokens with `push`, `pop` and `next`:

* **`push`** changes the lexer state, and pushes the old state onto the stack.
* **`pop`** returns to a previous state, by removing some number of states from the stack.
* **`next`** switches the lexer state before the next token, but does not affect the stack.


Contributing
------------

Before submitting an issue, [remember...](https://github.com/tjvr/moo/blob/master/.github/CONTRIBUTING.md)


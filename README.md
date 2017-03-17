![](cow.png)

Moo!
====

Moo is a highly-optimised tokenizer/lexer generator. Use it to tokenize your strings, before parsing 'em with a parser like [nearley](https://github.com/hardmath123/nearley) or whatever else you're into.

* [Fast](#is-it-fast)
* [Convenient](#usage)
* uses [Regular Expressions](#on-regular-expressions)
* tracks [Line Numbers](#line-numbers)
* handles [Keywords](#keywords)
* supports [States](#states)
* custom [Errors](#errors)
* is even [Iterable](#iteration)
* Moo!

Is it fast?
-----------

Yup! Flying-cows-and-singed-steak fast.

Moo is the fastest JS tokenizer around. It's **~2–10x** faster than most other tokenizers; it's a **couple orders of magnitude** faster than some of the slower ones.

Define your tokens **using regular expressions**. Moo will compile 'em down to a **single RegExp for performance**. It uses the new ES6 **sticky flag** where possible to make things faster; otherwise it falls back to an almost-as-efficient workaround. (For more than you ever wanted to know about this, read [adventures in the land of substrings and RegExps](http://mrale.ph/blog/2016/11/23/making-less-dart-faster.html).)

You _might_ be able to go faster still by writing your lexer by hand rather than using RegExps, but that's icky.

Oh, and it [avoids parsing RegExps by itself](https://hackernoon.com/the-madness-of-parsing-real-world-javascript-regexps-d9ee336df983#.2l8qu3l76). Because that would be horrible.


Usage
-----

First, you need to do the needful: `$ npm install moo`, `$ yarn install moo`, or whatever will ship this code to your computer. Alternatively, grab the `moo.js` file by itself and slap it into your web page via a `<script>` tag; it's completely standalone.

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

You can also feed it chunks of input at a time.

```j
    lexer.reset()
    lexer.feed('while')
    lexer.feed(' 10 cows\n')
    lexer.next() // -> { type: 'keyword', value: 'while' }
    // ...
```

If you've reached the end of Moo's internal buffer, next() will return `undefined`. You can always feed() it more if that happens.


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
    lexer.next() // -> { type: 'string', value: 'foo" "bar' }
    ```
    
    Better:
    
    ```js
    let lexer = moo.compile({
      string: /"(.*?)"/,   // non-greedy quantifier *?
      // ...
    })

    lexer.reset('"foo" "bar"')
    lexer.next() // -> { type: 'string', value: 'foo' }
    lexer.next() // -> { type: 'space', value: ' ' }
    lexer.next() // -> { type: 'string', value: 'bar' }
    ```

* The **order of your rules** matters. Earlier ones will take precedence.

    ```js
    moo.compile({
        word:  /[a-z]+/,
        foo:   'foo',
    }).reset('foo').next() // -> { type: 'word', value: 'foo' }

    moo.compile({
        foo:   'foo',
        word:  /[a-z]+/,
    }).reset('foo').next() // -> { type: 'foo', value: 'foo' }
    ```

* Moo uses **multiline RegExps**. This has a few quirks: for example, the **dot `/./` doesn't include newlines**. Use `[^]` instead if you want to match newlines too.

* Since excluding capture groups like `/[^ ]/` (no spaces) _will_ include newlines, you have to be careful not to include them by accident! In particular, the whitespace metacharacter `\s` includes newlines.


Line Numbers
------------

Moo tracks detailed information about the input for you.

It will track line numbers, as long as you apply the `lineBreaks: true` option to any tokens which might contain newlines. Moo will try to warn you if you forget to do this.

Token objects (returned from `next()`) have the following attributes:

* **`type`**: the name of the group, as passed to compile.
* **`value`**: the contents of the capturing group (or the whole match, if the token RegExp doesn't define a capture).
* **`size`**: the total length of the match (`value` may be shorter if you have capturing groups).
* **`offset`**: the number of bytes from the start of the buffer where the match starts.
* **`lineBreaks`**: the number of line breaks found in the match. (Always zero if this rule has `lineBreaks: false`.)
* **`line`**: the line number of the beginning of the match, starting from 1.
* **`col`**: the column where the match begins, starting from 1.


### Reset ###

Calling `reset()` on your lexer will empty its internal buffer, and set the line, column, and offset counts back to their initial value.

If you don't want this, you can `save()` the state, and later pass it as the second argument to `reset()` to explicitly control the internal state of the lexer.

```js
    let state = lexer.save() // -> { line: 10 }
    lexer.feed('some line\n')
    lexer.next() // -> { line: 10 }
    lexer.next() // -> { line: 11 }
    // ...
    lexer.reset('a different line\n', state)
    lexer.next() // -> { line: 10 }
```


Keywords
--------

Moo makes it convenient to define literals and keywords.

```js
    moo.compile({
      ['lparen',  '('],
      ['rparen',  ')'],
      ['keyword', ['while', 'if', 'else', 'moo', 'cows']],
    })
```

It'll automatically compile them into regular expressions, escaping them where necessary.

Important! **Always write your literals like this:**

```js
    ['while', 'if', 'else', 'moo', 'cows']
```

And **not** like this:

```js
    /while|if|else|moo|cows/
```

### Why? ###

The reason: Moo special-cases keywords to ensure the **longest match** principle applies, even in edge cases.

Imagine trying to parse the input `className` with the following rules:

      ['keyword',     ['class']],
      ['identifier',  /[a-zA-Z]+/],

You'll get _two_ tokens — `['class', 'Name']` -- which is _not_ what you want! If you swap the order of the rules, you'll fix this example; but now you'll lex `class` wrong (as an `identifier`).

Moo solves this by checking to see if any of your literals can be matched by one of your other rules; if so, it doesn't lex the keyword separately, but instead handles it at a later stage (by checking identifiers against a list of keywords).


States
------

Sometimes you want your lexer to support different states. This is useful for string interpolation, for example: to tokenize `a${{c: d}}e`, you might use:

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

To support this, Moo allows annotating tokens with `push`, `pop` and `next`:

* **`push`** moves the lexer to a new state, and pushes the old state onto the stack.
* **`pop`** returns to a previous state, by removing one or more states from the stack.
* **`next`** moves to a new state, but does not affect the stack.


Errors
------

If no token matches, Moo will throw an Error.

If you'd rather treat errors as just another kind of token, you can ask Moo to do so.

```js
    moo.compile({
      // ...
      myError: moo.error,
    })
    
    moo.reset('invalid')
    moo.next() // -> { type: 'myError', value: 'invalid' }
```


You can have a token type that both matches tokens _and_ contains error values.

```js
    moo.compile({
      // ...
      myError: {match: /[\$?`]/, error: true},
    })
```


Iteration
---------

Iterators: we got 'em.

```js
    for (let here of lexer) {
      // here = { type: 'number', value: '123', ... }
    }
```

Use [itt](https://github.com/nathan/itt)'s iteration tools with Moo.

```js
    for (let [here, next] = itt(lexer).lookahead()) { // pass a number if you need more tokens
      // enjoy!
    }
```


Contributing
------------

Before submitting an issue, [remember...](https://github.com/tjvr/moo/blob/master/.github/CONTRIBUTING.md)


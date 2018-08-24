
Remember...

<img src="feelings.png" width="600">

Philosophy
----------

> _Some thoughts on what moo is/isn't, for dev types._

Moo is a very fast lexer.

The input to Moo is a character stream. The output is a list of tokens.

You define _rules_ for matching patterns in a stream. A rule defines both a pattern to match, and the `type` to label it with. A Token object tells the contents of the match (its `value`), its `type`, and the position in the stream.

Keywords are a natural extension to this model: they let you further specialise a pattern. When a keyword matches it relabels the token to instead have the `type` of the keyword.

The rules get compiled down to a single regular expression. At its core, moo is a fancy helper for combining rules into a RegExp, and working out which rule matched.

Moo provides primitives for manipulating the stream--`reset` and `save`--so that you can implement your own streaming strategy on top.

Under this view of moo, it seems hard to justify including `states` in moo itself--states could just as well be a library on top of moo, that performed a `save` and `reset` call every time it wanted to switch lexers! However, I think we can justify including states due to a) efficiency--the scheme above sounds expensive--and b) convenience. Stateful lexers are common enough that it's worth including them in the core of moo.

...as opposed to things like skipping whitespace tokens, or a scheme to generate INDENT and DEDENT tokens from Python-style indentation, which can very easily be a library. Providing support for that sort of thing inside moo itself would probably involve transformer functions, which would entail a polymorphic function call on the matched rule--which would reduce performance for everybody.

Similarly, error handling has to be in moo core, because it couldn't be added as a library. But it's simple enough, and returns enough information, for you to decide what to do about errors yourself--specific to your own application. (Usually, though, all you want to do is raise the error moo gives you!).

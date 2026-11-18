# Names you can predict

[Icons plugin reference](README.md)

The name of an icon is its file or Iconify name in PascalCase. You read it from
the icon you see in the Iconify catalog or in your folder, without a lookup
table. These are real names of the `hugeicons` collection:

| Icon                                    | Import by name                                     | Import by path                 |
| --------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `github`                                | `Github`                                           | `icon:hugeicons/github`        |
| `arrow-left-01`                         | `ArrowLeft01`                                      | `icon:hugeicons/arrow-left-01` |
| `arrow-down-01`                         | `ArrowDown_01`, because `arrow-down01` also exists | `icon:hugeicons/arrow-down-01` |
| `arrow-down01`                          | none                                               | `icon:hugeicons/arrow-down01`  |
| `3d-move`                               | `Icon3dMove`                                       | `icon:hugeicons/3d-move`       |
| `first-bracket`, alias of `1st-bracket` | `FirstBracket`, next to `Icon1stBracket`           | `icon:hugeicons/first-bracket` |

The rule, in the order the plugin applies it:

1. Split the name at every character that is not a letter or a digit, and write
   each part with a capital first letter: `arrow-left-01` is `ArrowLeft01`, and
   `logo.v2` is `LogoV2`.
2. A name that starts with a digit gets the `Icon` prefix, because an identifier
   cannot start with one: `3d-move` is `Icon3dMove`.
3. When two different icons give the same name, that name is not exported, so it
   never depends on which of the two the plugin reads first. Each of the two
   gets its strict name, which keeps an underscore before a group of digits that
   follows a separator: `arrow-down-01` and `arrow-down01` both give
   `ArrowDown01`, so `arrow-down-01` is `ArrowDown_01`.
4. An icon whose strict name is the same as the plain one, as `arrow-down01`, or
   whose strict name another icon also claims, keeps only its import by path.
5. An alias of an Iconify collection gets a name by the same rule and loads the
   same module as its icon, so an alias and its own icon never collide. An alias
   whose name matches a different icon is a collision, as in step 3. An alias
   that flips or rotates its icon is an icon of its own, and so is an alias of
   an icon whose name no import can spell.
6. A name gets an export only when its icon loads: an icon of `icons.json`
   without a body, an alias that is not an object and an alias that leads to no
   icon with a body have none, and an icon wins over an alias of its name, also
   where another alias points to that name.

The result does not depend on the order of the icons in the collection. A strict
name always has an underscore, which no plain name has, so it never takes the
name of another icon.

On 2026-11-17, the version of `@iconify-json/hugeicons` that the tests of the
package install had 6,140 icons and 26 aliases, which gave 6,149 export names in
the declaration file that the plugin wrote that day. Fourteen icons have no
export name and keep their import by path: `arrow-down01`, `arrow-down10`,
`arrow-up01`, `arrow-up10`, `axis3d`, `book-up2`, `circle-slash2`,
`file-axis3d`, `folder-git2`, `rotate3d`, `rows2`, `rows3`, `rows4` and
`scale3d`.

Ten of those names are also globals of the browser or of JavaScript:
`Clipboard`, `Function`, `Gamepad`, `History`, `Lock`, `Map`, `Math`,
`Navigation`, `Option` and `Text`. Importing one under its own name hides the
global in that module, so that module can no longer reach the global `Map`.
Rename it on import:

```ts
import { Map as MapIcon } from 'icon:hugeicons'
```

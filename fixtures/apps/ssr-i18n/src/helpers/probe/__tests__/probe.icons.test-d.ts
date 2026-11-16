import type { ComponentProps, JSX } from '@solidjs/web'
import { Mark } from 'icon:scenario'
import IconMark from 'icon:scenario/mark'
import markSvg from 'icon:scenario/mark?raw'
import { expectTypeOf } from 'vite-plus/test'

type Icon = (props: ComponentProps<'svg'>) => JSX.Element

describe('packaged icon types', () => {
  it('types an icon by its path, by its name and as text', () => {
    expectTypeOf(IconMark).not.toBeAny()
    expectTypeOf(Mark).not.toBeAny()
    expectTypeOf(markSvg).not.toBeAny()
    expectTypeOf(IconMark).toEqualTypeOf<Icon>()
    expectTypeOf(Mark).toEqualTypeOf<Icon>()
    expectTypeOf(markSvg).toEqualTypeOf<string>()
  })
})

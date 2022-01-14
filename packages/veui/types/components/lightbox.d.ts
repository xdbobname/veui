import { VeuiDefineInstance, LooseObject } from '../common/context'
import { UiMixin } from '../common/mixins'
import { Props as DialogProps, Emits as DialogEmits } from './dialog'
import { CarouselCommonProps, Item } from './carousel'

export type PreviewOptions = LooseObject<{
  video?: LooseObject<{
    muted?: boolean
    autoplay?: boolean
    controls?: boolean
  }>
}>

type Props<T extends Item> = CarouselCommonProps<T> & {
  open?: boolean
  closable?: boolean
  escapable?: boolean
  beforeClose?: DialogProps['beforeClose']
  priority?: number
  indicator?: 'number' | 'none'
  options?: PreviewOptions
}

type Emits = DialogEmits

type Mixins = UiMixin

type SlotScope = LooseObject<Item> & { index: number }

type Slots = {
  item(slotProps: SlotScope & { preload: boolean } ): unknown
  desc(slotProps: SlotScope): unknown
}

type Lightbox = {
  new <T extends Item = Item>(...args: any[]): VeuiDefineInstance<Props<T>, Emits, Slots, Mixins>
}

export default Lightbox

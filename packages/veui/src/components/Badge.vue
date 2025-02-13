<template>
<div
  :class="{
    [$c('badge')]: true,
    [$c('badge-standalone')]: standalone
  }"
>
  <slot/>
  <transition :name="$c('badge')">
    <span
      v-if="!hidden"
      :class="{
        [$c('badge-main')]: true,
        [$c(`badge-${content && !standalone ? 'label' : 'dot'}`)]: true,
        [$c(`badge-${type}`)]: true
      }"
    >{{ !standalone ? content : '' }}</span>
  </transition>
  <span v-if="standalone && value" :class="$c('badge-standalone-label')">
    {{ value }}
  </span>
</div>
</template>

<script>
import prefix from '../mixins/prefix'
import ui from '../mixins/ui'
import { isNumber } from 'lodash'
import config from '../managers/config'
import useConfig from '../mixins/config'
import '../common/global'

config.defaults(
  {
    max: 999
  },
  'badge'
)

export default {
  name: 'veui-badge',
  mixins: [prefix, ui, useConfig('config', 'badge')],
  props: {
    value: [Number, String],
    max: {
      type: Number,
      validator (val) {
        return val == null || (Math.floor(val) === val && val > 0)
      }
    },
    hidden: Boolean,
    type: {
      type: String,
      default: 'error'
    }
  },
  computed: {
    standalone () {
      return !this.$slots.default
    },
    realMax () {
      return this.max || this.config['badge.max']
    },
    content () {
      if (!isNumber(this.value)) {
        return this.value ? this.value : null
      }
      return this.realMax && this.value > this.realMax
        ? `${this.realMax}+`
        : `${this.value}`
    }
  }
}
</script>

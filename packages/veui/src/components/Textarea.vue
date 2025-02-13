<template>
<div
  v-resize="{
    handler: handleRootResize
  }"
  :class="{
    [$c('textarea')]: true,
    [$c('focus')]: focused,
    [$c('textarea-rows')]: realRows > 0,
    [$c('textarea-line-numbered')]: lineNumber,
    [$c('textarea-autoresize')]: realAutoresize,
    [$c('textarea-resizable')]: resizable,
    [$c('textarea-count-overlap')]: countOverlap,
    [$c('invalid')]: realInvalid || lengthOverflow,
    [$c('readonly')]: realReadonly,
    [$c('disabled')]: realDisabled
  }"
  :ui="realUi"
  v-on="containerListeners"
>
  <div
    v-if="measure"
    v-show="measurerContentWidth !== 0"
    ref="measurer"
    aria-hidden="true"
    :class="$c('textarea-measurer')"
  >
    <div
      v-for="(line, index) in lines"
      :key="index"
      :class="$c('textarea-measurer-line')"
    >
      <!-- eslint-disable vue/multiline-html-element-content-newline -->
      <div
        v-if="lineNumber"
        :class="$c('textarea-measurer-line-number')"
        :style="{ width: `${lineNumberWidth}px` }"
      >
        {{ index + 1 }}
      </div>
      <div
        :class="$c('textarea-measurer-line-content')"
        aria-hidden="true"
        :style="{ width: `${measurerContentWidth}px` }"
      >
        <span style="box-shadow: transparent 0 0">{{ line }}</span>
      </div>
      <!-- eslint-enable vue/multiline-html-element-content-newline -->
    </div>
  </div>
  <textarea
    ref="input"
    :value="tmpInputValue == null ? realValue : tmpInputValue"
    :class="$c('textarea-input')"
    :style="inputStyle"
    :placeholder="placeholder"
    v-bind="attrs"
    v-on="inputListeners"
    @focus="handleFocus"
    @blur="handleBlur"
    @input="handleInput"
    @scroll="handleScroll"
    @compositionupdate="handleCompositionUpdate"
    @compositionend="handleCompositionEnd"
    @change="$emit('change', $event.target.value, $event)"
  />
  <span
    v-if="realMaxlength !== null"
    ref="count"
    :class="{
      [$c('textarea-count')]: true,
      [$c('textarea-count-overflow')]: lengthOverflow
    }"
  >{{ length }}/{{ realMaxlength }}</span>
</div>
</template>

<script>
import { pick } from 'lodash'
import prefix from '../mixins/prefix'
import ui from '../mixins/ui'
import resize from '../directives/resize'
import input from '../mixins/input'
import activatable from '../mixins/activatable'
import useControllable from '../mixins/controllable'
import { log10 } from '../utils/math'
import { normalizeInt } from '../utils/helper'
import warn from '../utils/warn'
import {
  getAbsoluteLineHeight,
  MOUSE_EVENTS,
  KEYBOARD_EVENTS,
  FOCUS_EVENTS
} from '../utils/dom'
import '../common/global'

const COMPOSITION_UPDATE = 'UPDATE'
const COMPOSITION_INPUT = 'INPUT'

export default {
  name: 'veui-textarea',
  directives: {
    resize
  },
  mixins: [
    prefix,
    ui,
    input,
    activatable,
    useControllable({
      prop: 'value',
      event: 'input',
      get (val) {
        return val || ''
      }
    })
  ],
  inheritAttrs: false,
  props: {
    placeholder: String,
    value: {
      type: String,
      default: ''
    },
    lineNumber: Boolean,
    rows: [Number, String],
    selectOnFocus: Boolean,
    composition: Boolean,
    autoresize: Boolean,
    resizable: Boolean,
    maxlength: [Number, String],
    getLength: Function,
    strict: Boolean
  },
  data () {
    return {
      focused: false,
      height: 0,
      measurerContentWidth: 0,
      measurerContentHeight: 0,
      scrollTop: 0,
      rowsHeight: null,
      originalPadding: null,
      composing: false,
      // tmpInputValue 参见 Input
      tmpInputValue: null,
      countOverlap: false,
      lastHeight: 0
    }
  },
  computed: {
    realMaxlength () {
      return normalizeInt(this.maxlength)
    },
    realRows () {
      return normalizeInt(this.rows)
    },
    attrs () {
      return {
        ...this.$attrs,
        maxlength: this.strict ? this.realMaxlength : null,
        rows: this.realRows,
        disabled: this.realDisabled,
        readonly: this.realReadonly
      }
    },
    inputListeners () {
      return pick(this.listenersWithValidations, [
        ...KEYBOARD_EVENTS,
        ...FOCUS_EVENTS
      ])
    },
    containerListeners () {
      return pick(this.listenersWithValidations, MOUSE_EVENTS)
    },
    realAutoresize () {
      return this.autoresize && !this.resizable
    },
    measure () {
      return (
        this.lineNumber || this.realAutoresize || this.realMaxlength !== null
      )
    },
    lines () {
      // use a zero-width space to prevent empty element from being collapsed
      return this.realValue.split('\n').map((line) => line || `\u200b${line}`)
    },
    digits () {
      return Math.floor(log10(this.lines.length)) + 1
    },
    lineNumberWidth () {
      return this.digits * 8 + 12
    },
    contentHeight () {
      if (this.realAutoresize) {
        return `${this.measurerContentHeight}px`
      }

      return `${this.rowsHeight}px`
    },
    realSelectOnFocus () {
      return this.type !== 'hidden' && this.selectOnFocus
    },
    length () {
      return typeof this.getLength === 'function'
        ? this.getLength(this.realValue)
        : this.realValue.length
    },
    lengthOverflow () {
      if (this.realMaxlength == null) {
        return false
      }
      return this.length > this.realMaxlength
    },
    inputStyle () {
      return {
        maxWidth: this.lineNumber ? null : '100%',
        width: this.lineNumber
          ? `calc(100% - ${this.lineNumberWidth}px)`
          : null,
        height: this.contentHeight || null,
        // autoresize 的时候 hidden 一下，避免闪现一下滚动条。
        overflow: this.realAutoresize ? 'hidden' : 'auto'
      }
    },
    checkStrict () {
      return {
        strict: this.strict,
        getLength: this.getLength
      }
    }
  },
  watch: {
    checkStrict: {
      handler ({ strict, getLength } = {}) {
        if (strict && getLength) {
          warn(
            '[veui-textarea] `strict` must be `false` when `getLength` is provided.',
            this
          )
        }
      },
      immediate: true
    },
    realValue: {
      handler () {
        if (!this.measure) {
          return
        }
        this.$nextTick(this.updateMeasurer)
      },
      immediate: true
    },
    countOverlap (val) {
      if (!val) {
        return
      }
      let { input } = this.$refs
      if (input.value.length === input.selectionStart) {
        // at the end
        setTimeout(() => {
          this.scrollTop = input.scrollHeight
        })
      }
    },
    scrollTop (val) {
      return this.syncScroll(val)
    }
  },
  updated () {
    this.$nextTick(() => this.syncScroll())
  },
  mounted () {
    this.scrollTop = this.$refs.input.scrollTop
    this.updateRowsHeight()
  },
  methods: {
    updateRowsHeight () {
      let { input } = this.$refs
      if (input) {
        this.rowsHeight = this.getRowsHeight()
      }
    },
    updateMeasurer () {
      let { input } = this.$refs
      if (!input) {
        return
      }
      this.measurerContentWidth = input.clientWidth

      this.$nextTick(() => {
        if (this.realMaxlength !== null) {
          this.checkCountOverlap()

          this.$nextTick(() => {
            if (this.realAutoresize) {
              this.updateMeasurerHeight()
            }
          })
        } else if (this.realAutoresize) {
          this.updateMeasurerHeight()
        }
      })
    },
    getRowsHeight () {
      if (!this.realRows) {
        return null
      }
      let { input } = this.$refs
      let lineHeight = getAbsoluteLineHeight(input)
      let { borderTopWidth, paddingTop, paddingBottom, borderBottomWidth } =
        getComputedStyle(input)

      return (
        this.realRows * lineHeight +
        [borderTopWidth, paddingTop, paddingBottom, borderBottomWidth]
          .map((val) => parseFloat(val))
          .reduce((acc, cur) => acc + cur, 0)
      )
    },
    isCountOverlap () {
      let { measurer, input, count } = this.$refs
      if (!measurer || !input || !count) {
        return false
      }
      let lines = [
        ...measurer.querySelectorAll(
          `.${this.$c('textarea-measurer-line-content')}`
        )
      ]
      // there will be at lease one line
      let rects = lines[lines.length - 1].querySelector('span').getClientRects()
      let rect = rects[rects.length - 1]

      if (!rect) {
        return false
      }

      let { paddingLeft, paddingRight } = getComputedStyle(input)
      let pl = parseFloat(paddingLeft)
      let pr = parseFloat(paddingRight)

      let { marginLeft } = getComputedStyle(count)
      let mr = parseFloat(marginLeft)

      return pl + rect.width + mr + count.offsetWidth + pr > input.clientWidth
    },
    checkCountOverlap () {
      this.countOverlap = this.isCountOverlap()
    },
    handleFocus (e) {
      this.focused = true

      if (this.realSelectOnFocus && e.target) {
        e.target.select()
      }
    },
    handleBlur () {
      this.focused = false
    },
    updateValue (value, ...args) {
      this.commit('value', value, ...args)
      this.$nextTick(() => {
        let input = this.$refs.input
        this.tmpInputValue = null
        if (input && this.realValue !== input.value) {
          input.value = this.realValue
        }
      })
    },
    handleCompositionUpdate (e) {
      this.tmpInputValue = e.target.value
      this.composing = COMPOSITION_UPDATE
    },
    handleCompositionEnd (e) {
      let extra = this.composing === COMPOSITION_INPUT
      this.tmpInputValue = e.target.value
      this.composing = false
      if (extra) {
        // compositionend 事件，而非 input
        this.updateValue(e.target.value, e)
      }
    },
    handleInput (e) {
      // 1. 感知输入法，触发原生 input 事件就必须向上继续抛出
      // 2. 不感知输入法
      //  不用 v-model 的原因：在 firefox 下 compositionend 时 vue 会多触发一次 input
      //  在中文输入法的状态下，又去修改了 input 的值（比如受控情况下 reset 掉用户输入），此时不同浏览器的事件触发情况又不同
      //  所以受控中文输入法之后，事件的触发情况尽量不要依赖。
      this.tmpInputValue = e.target.value
      if (this.composing === COMPOSITION_UPDATE) {
        this.composing = COMPOSITION_INPUT
      }

      if (this.composition || this.composing !== COMPOSITION_INPUT) {
        this.updateValue(e.target.value, e)
      }

      this.$nextTick(() => {
        let { input } = this.$refs
        if (!input) {
          return
        }
        let inputLineHeight = getAbsoluteLineHeight(input)
        if (
          input.scrollHeight - input.clientHeight - input.scrollTop <
          inputLineHeight
        ) {
          this.scrollTop = input.scrollHeight - input.clientHeight
        }
      })
    },
    handleRootResize () {
      let { input } = this.$refs
      let { offsetHeight } = input
      if (offsetHeight > 0 && this.lastHeight === 0) {
        if (this.realAutoresize) {
          this.updateMeasurer()
        } else {
          this.updateRowsHeight()
        }
      }
      this.lastHeight = offsetHeight
    },
    focus () {
      let { input } = this.$refs
      if (input) {
        input.focus()
      }
    },
    activate () {
      if (this.realDisabled || this.realReadonly) {
        return
      }
      this.focus()
    },
    updateMeasurerHeight () {
      let { measurer } = this.$refs
      if (measurer) {
        this.measurerContentHeight = measurer.offsetHeight
      }
    },
    handleScroll () {
      if (!this.measure) {
        return
      }
      this.scrollTop = this.$refs.input.scrollTop
    },
    syncScroll (val) {
      let top = val == null ? this.scrollTop : val
      let { input, measurer } = this.$refs
      if (input) {
        input.scrollTop = top
      }
      if (measurer) {
        measurer.scrollTop = top
      }
    }
  }
}
</script>

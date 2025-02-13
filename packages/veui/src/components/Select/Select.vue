<script>
import Icon from '../Icon'
import Input from '../Input'
import Button from '../Button'
import Tag from '../Tag'
import OptionGroup from './OptionGroup'
import Overlay from '../Overlay'
import Checkbox from '../Checkbox'
import config from '../../managers/config'
import useConfig from '../../mixins/config'
import prefix from '../../mixins/prefix'
import ui from '../../mixins/ui'
import input from '../../mixins/input'
import dropdown from '../../mixins/dropdown'
import useSearchable from '../../mixins/searchable'
import { useKeySelect } from '../../mixins/key-select'
import useControllable from '../../mixins/controllable'
import i18n from '../../mixins/i18n'
import { find, walk } from '../../utils/datasource'
import { uniqueId, omit } from 'lodash'
import { contains, focusIn } from '../../utils/dom'
import { renderSlot } from '../../utils/helper'
import { SelectProvider } from './_SelectContext'
import '../../common/global'

config.defaults(
  {
    placeholder: '@@select.placeholder'
  },
  'select'
)

const SELECT_ALL_VALUE = Symbol('select_all')

export default {
  name: 'veui-select',
  uiTypes: ['select'],
  mixins: [
    prefix,
    ui,
    input,
    dropdown(),
    useConfig('config', 'select'),
    useKeySelect({
      useNativeFocus (vm) {
        return !vm.searchable
      },
      expandedKey: 'realExpanded'
    }),
    useSearchable({
      datasourceKey: 'realOptions',
      childrenKey: 'options',
      keywordKey: 'inputValue',
      resultKey: 'filteredOptions',
      exposeProps: true
    }),
    useControllable({
      prop: 'value',
      event: 'change',
      get (val) {
        // 保证多选 realValue 一定是数组
        // 保证单选没值一定是 null
        return this.multiple
          ? val != null
            ? [].concat(val)
            : []
          : val != null
            ? val
            : null
      }
    }),
    i18n
  ],
  model: {
    event: 'change'
  },
  props: {
    /* eslint-disable vue/require-prop-types */
    value: {},
    /* eslint-ensable vue/require-prop-types */
    placeholder: String,
    clearable: Boolean,
    searchable: Boolean,
    options: Array,
    multiple: Boolean,
    showSelectAll: Boolean,
    composition: Boolean,
    max: Number
  },
  data () {
    return {
      labelId: uniqueId('veui-select-label-'),
      outsideRefs: ['root'],
      inputValue: '',
      inlineOptions: null
    }
  },
  computed: {
    selected () {
      if (this.isEmpty) {
        return this.realValue
      }

      if (this.multiple) {
        return this.realValue
          .map((val) => findOptionByValue(this.realOptions, val))
          .filter(Boolean)
      }

      return findOptionByValue(this.realOptions, this.realValue)
    },
    realPlaceholder () {
      return this.placeholder == null
        ? this.config['select.placeholder']
        : this.placeholder
    },
    inputPlaceholder () {
      if (this.multiple) {
        if (!this.isEmpty || !this.searchable) {
          return ''
        }
        return this.realPlaceholder
      }
      return this.isEmpty
        ? this.realPlaceholder
        : this.searchable
          ? this.label
          : ''
    },
    realShowSelectAll () {
      return this.multiple && !this.max && this.showSelectAll
    },
    label () {
      return this.selected ? this.selected.label : ''
    },
    labels () {
      if (!Array.isArray(this.selected)) {
        return []
      }
      return this.selected.map(({ label, value }) => label || value)
    },
    searchInputLabel () {
      if (this.inputValue) {
        return this.inputValue
      }
      if (this.realValue == null || this.realExpanded) {
        return ''
      }
      return this.label
    },
    limitLabel () {
      if (this.multiple && this.max) {
        return `${(this.labels || []).length}/${this.max}`
      }
      return null
    },
    realOptions () {
      return this.options ? this.options.map(normalizeItem) : this.inlineOptions
    },
    optionsWithSelectAll () {
      if (this.realShowSelectAll) {
        return [this.selectAllOption, ...this.realOptions]
      }
      return this.realOptions
    },
    selectAllData () {
      let selectable = []
      let deselectable = []
      let allSelected = true
      let allIndeterminate = false
      walk(
        this.realOptions,
        (option, { skip }) => {
          const { disabled, value, options } = option
          const isLeaf = !options || !options.length

          if (isLeaf) {
            const checked = this.realValue.indexOf(value) >= 0
            allSelected = allSelected && checked
            allIndeterminate = allIndeterminate || checked
            if (!disabled && value != null) {
              const container =
                this.realValue.indexOf(value) >= 0 ? deselectable : selectable
              container.push(value)
            }
          }

          skip(disabled)
        },
        'options'
      )
      return {
        selectable,
        deselectable,
        selected: allSelected && allIndeterminate, // && 目的：空的时候返回false
        indeterminate: allIndeterminate && !allSelected
      }
    },
    isFiltered () {
      return !!(this.searchable && this.inputValue)
    },
    isEmpty () {
      return (
        this.realValue == null || (this.multiple && this.realValue.length === 0)
      )
    },
    isMultiLevel () {
      return this.realOptions
        ? this.realOptions.some(
          (option) =>
            option.options &&
              option.options.length > 0 &&
              option.position === 'popup'
        )
        : false
    },
    isMatchWidth () {
      return !this.isMultiLevel || !!this.inputValue
    },
    hasLabelSlot () {
      return !!(this.$scopedSlots.label || this.$slots.label)
    },
    hasSelectedSlot () {
      return !!(this.$scopedSlots.selected || this.$slots.selected)
    },
    triggerAttrs () {
      return {
        ui: this.realUi,
        role: 'listbox',
        'aria-owns': this.dropdownId,
        'aria-readonly': this.realReadonly,
        'aria-expanded': this.realExpanded,
        'aria-disabled': this.realDisabled,
        'aria-labelledby': this.labelId,
        'aria-haspopup': 'listbox',
        tabindex:
          (this.searchable && this.multiple) || this.realDisabled ? null : '0'
      }
    },
    slotProps () {
      // vue methods 都是绑定过的
      return {
        expanded: this.realExpanded,
        value: this.realValue,
        toggle: this.toggleExpanded,
        select: (val) => this.commit('value', val),
        close: this.close
      }
    },
    layoutWrap () {
      return (
        this.multiple &&
        !this.isEmpty &&
        (!this.hasLabelSlot || this.realExpanded) &&
        !this.hasSelectedSlot
      )
    },
    selectAllOption () {
      return {
        label: this.t('selectAll'),
        value: SELECT_ALL_VALUE,
        selected: this.selectAllData.isAllSelected,
        disabled: this.realDisabled
      }
    }
  },
  watch: {
    realExpanded (val) {
      if (this.searchable && !val) {
        this.inputValue = ''
      }
    }
  },
  mounted () {
    this.nativeInput = this.$refs.input && this.$refs.input.$refs.input
  },
  methods: {
    toggleExpanded (force) {
      this.commit('expanded', force == null ? !this.realExpanded : !!force)
    },
    clear (e) {
      if (this.multiple) {
        let disabledValues = this.realValue
          .map((value) => findOptionByValue(this.realOptions, value))
          .filter(({ disabled } = {}) => disabled)
          .map(({ value }) => value)
        this.commit('value', disabledValues)
      } else {
        let { disabled } =
          findOptionByValue(this.realOptions, this.realValue) || {}
        if (!disabled) {
          this.commit('value', null)
        }
      }

      this.inputValue = ''
      this.$emit('clear')
      e.stopPropagation()
      if (this.realExpanded) {
        this.focus()
      }
    },
    handleSelect (val) {
      if (this.searchable) {
        this.$nextTick(() => {
          if (this.multiple) {
            this.inputValue = ''
            this.focus()
          }
        })
      }
      if (!this.multiple) {
        this.commit('expanded', false)
        this.commit('value', val)
        return
      }

      // 全选
      if (SELECT_ALL_VALUE === val) {
        return this.handleSelectAll()
      }

      let index = this.realValue.indexOf(val)
      if (index !== -1) {
        // remove
        this.removeSelectedAt(index)
      } else {
        if (!this.max || (this.max && this.realValue.length < this.max)) {
          this.commit('value', this.realValue.concat(val))
        }
      }
    },
    removeSelectedAt (index) {
      let val = [...this.realValue]
      val.splice(index, 1)
      this.commit('value', val)
    },
    handleRelocate () {
      let { options } = this.$refs
      if (options) {
        options.relocateDeep()
      }
    },
    handleInputMouseup (e) {
      if (this.realReadonly || this.realDisabled) {
        return
      }

      this.commit('expanded', !this.realExpanded)
      if (this.realExpanded) {
        this.focus()
      }
      e.preventDefault()
      e.stopPropagation()
    },
    handleInputBlur (e) {
      if (
        this.multiple &&
        this.$refs.box &&
        contains(this.$refs.box, e.relatedTarget, true)
      ) {
        e.target.focus()
      }
    },
    handleTriggerKeydown (e) {
      let passive = true
      switch (e.key) {
        case 'Up':
        case 'ArrowUp':
        case 'Down':
        case 'ArrowDown':
          this.commit('expanded', true)
          passive = false
          if (this.searchable) {
            this.focusInput()
            this.$nextTick(() => {
              this.handleKeydown(e)
            })
          }
          break
        case 'Esc':
        case 'Escape':
          if (this.searchable) {
            this.$el.focus()
            this.commit('expanded', false)
            passive = false
          }
          break
        case 'Tab':
          this.commit('expanded', false)
          break
        case 'Enter':
          if (this.searchable) {
            if (!this.realExpanded) {
              this.focusInput()
              this.commit('expanded', true)
              break
            }
            let elem = this.getCurrentActiveElement()
            if (elem) {
              elem.click()
            }
            this.$el.focus()
          } else {
            this.commit('expanded', true)
          }
          break
        case 'Backspace': {
          if (this.isEmpty) {
            break
          }

          if (this.multiple && this.searchable && !this.inputValue) {
            let values = this.realValue
            for (let i = values.length - 1; i >= 0; i--) {
              let option = findOptionByValue(this.realOptions, values[i])
              if (!option.disabled) {
                let result = [...this.realValue]
                result.splice(i, 1)
                this.commit('value', result)
                break
              }
            }
          }
          break
        }
        default:
          break
      }
      if (!passive) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    handleTriggerInput (val) {
      this.$emit('input', val)
      this.inputValue = val
      this.commit('expanded', true)
      if (this.multiple && this.searchable) {
        this.nativeInput.style.width = ''
        this.nativeInput.style.width = `${this.nativeInput.scrollWidth}px`
      }
    },
    handleAfteropen () {
      this.$emit('afteropen')
    },
    focus () {
      if (!this.searchable) {
        this.$el.focus()
        return
      }
      this.focusInput()
    },
    focusInput () {
      let { input, root } = this.$refs
      if (input) {
        input.focus()
      } else {
        focusIn(root)
      }
    },
    isSelected (value) {
      if (value == null || this.realValue == null) {
        return false
      } else if (value === SELECT_ALL_VALUE) {
        return this.selectAllData.selected
      }
      let selectValue = this.realValue
      return Array.isArray(selectValue)
        ? selectValue.indexOf(value) !== -1
        : selectValue === value
    },
    handleSelectAll () {
      const { selectable, deselectable } = this.selectAllData
      if (deselectable.length) {
        this.commit(
          'value',
          this.realValue.filter((val) => deselectable.indexOf(val) === -1)
        )
      } else if (selectable.length) {
        this.commit('value', this.realValue.concat(selectable))
      }
    }
  },
  render () {
    let optionLabel = this.isFiltered
      ? ({ matches }) => {
        if (!matches) {
          return null
        }
        return matches.map(({ parts }, idx) => {
          let item = parts.map(({ text, matched }, index) => {
            return matched ? (
              <mark class={this.$c('option-matched')}>{text}</mark>
            ) : (
              <span>{text}</span>
            )
          })
          if (idx < matches.length - 1) {
            item.push(<span class={this.$c('option-separator')}> &gt; </span>)
          }
          return item
        })
      }
      : null

    let option = this.multiple
      ? (option) => {
        const isSelecteAllOption = option.value === SELECT_ALL_VALUE
        const { selected, indeterminate } = this.selectAllData
        return (
          <Checkbox
            tabindex="-1"
            ui={this.uiParts.checkbox}
            checked={isSelecteAllOption ? selected : !!option.selected}
            disabled={!!option.disabled}
            indeterminate={isSelecteAllOption ? indeterminate : false}
            onClick={(e) => e.preventDefault()}
          >
            {option.renderLabel
              ? option.renderLabel(omit(option, ['renderLabel']))
              : renderSlot(this, 'option-label', option) ||
                  (this.isFiltered ? optionLabel(option) : option.label)}
          </Checkbox>
        )
      }
      : null

    let selected = Array.isArray(this.selected) ? this.selected : []
    let selectedTags = selected.map(({ label, value, disabled }, index) => (
      <Tag
        key={value}
        data-key={value}
        onRemove={() => this.removeSelectedAt(index)}
        disabled={this.realDisabled || this.realReadonly || disabled}
        removable={!this.disabled && !disabled}
        {...{
          nativeOn: {
            '!mouseup': stopPropagation
          }
        }}
      >
        {renderSlot(this, 'tag', {
          label,
          ...findOptionByValue(this.realOptions, value),
          index
        }) || label}
      </Tag>
    ))

    let renderCustomLabel = (props) => {
      let customLabel = renderSlot(this, 'label', props)
      if (!customLabel) {
        return null
      }

      return <div class={this.$c('select-custom-label')}>{customLabel}</div>
    }

    let renderCustomSelected = (props) => {
      let customSelected = renderSlot(this, 'selected', props)
      if (!customSelected) {
        return null
      }

      return (
        <div class={this.$c('select-custom-selected')}>{customSelected}</div>
      )
    }

    let renderLabelOrSelected = (props) =>
      renderCustomLabel(props) || renderCustomSelected(props)

    let multiBeforeSlot = this.multiple ? (
      this.selected.length > 0 &&
      ((this.hasLabelSlot && !this.realExpanded) || this.hasSelectedSlot) ? (
          this.hasLabelSlot && !this.realExpanded ? (
            renderCustomLabel({ selected: this.selected })
          ) : (
            renderCustomSelected({ selected: this.selected })
          )
        ) : this.selected.length === 0 && !this.searchable ? (
          <span class={this.$c('select-placeholder')} id={this.labelId}>
            {this.realPlaceholder}
          </span>
        ) : (
          selectedTags
        )
    ) : null

    let beforeSlot =
      !this.multiple && !this.searchable && !this.isEmpty ? (
        <div
          class={{
            [this.$c('select-label')]: true
          }}
          id={this.labelId}
        >
          {renderLabelOrSelected({
            ...this.selected,
            selected: true
          }) || this.label}
        </div>
      ) : null

    let renderGroup = (options, children, renderFor) => {
      // overlay-class={this.overlayClass} 先不透传吧
      return (
        <SelectProvider value={renderFor}>
          <OptionGroup
            key={renderFor}
            v-show={!!options}
            hidden={!options}
            aria-hidden={!options}
            ref="options"
            options={options}
            overlay-style={this.overlayStyle}
            scopedSlots={{
              label: this.$scopedSlots['group-label'] || null,
              option: this.$scopedSlots.option || option,
              'option-label': this.$scopedSlots['option-label'] || optionLabel
            }}
          >
            {children}
          </OptionGroup>
        </SelectProvider>
      )
    }

    return (
      <div
        class={{
          [this.$c('select')]: true,
          [this.$c('select-empty')]: this.isEmpty,
          [this.$c('select-expanded')]: this.realExpanded,
          [this.$c('select-searchable')]: this.searchable,
          [this.$c('select-multiple')]: this.multiple,
          [this.$c('select-wrap')]: this.layoutWrap,
          [this.$c('readonly')]: this.realReadonly,
          [this.$c('disabled')]: this.realDisabled,
          [this.$c('invalid')]: this.realInvalid
        }}
        ui={this.realUi}
        ref="root"
        onKeydown={this.handleTriggerKeydown}
        {...(this.$scopedSlots.trigger
          ? null
          : {
            attrs: this.triggerAttrs
          })}
      >
        {!this.options
          ? renderGroup(null, renderSlot(this, 'default'), 'data')
          : null}
        {this.$scopedSlots.trigger ? (
          this.$scopedSlots.trigger({
            handlers: {
              click: this.handleInputMouseup,
              blur: this.handleInputBlur,
              input: this.handleTriggerInput
            },
            attrs: this.triggerAttrs,
            ...this.slotProps
          })
        ) : (
          <Input
            ref="input"
            class={this.$c('select-trigger')}
            disabled={this.realDisabled}
            readonly={this.realReadonly}
            invalid={this.realInvalid}
            placeholder={this.inputPlaceholder}
            value={this.inputValue}
            onMouseup={this.handleInputMouseup}
            onBlur={this.handleInputBlur}
            onInput={this.handleTriggerInput}
            autocomplete="off"
            composition={this.composition}
          >
            {!this.multiple &&
            this.searchable &&
            this.selected != null &&
            (this.hasLabelSlot || this.hasSelectedSlot) ? (
                <template slot="placeholder">
                  {renderLabelOrSelected({
                    ...this.selected,
                    selected: !this.isEmpty
                  }) || this.label}
                </template>
              ) : null}
            <template slot="before">
              {this.multiple ? multiBeforeSlot : beforeSlot}
            </template>
            <template slot="after">
              {this.limitLabel ? (
                <span class={this.$c('select-count')}>{this.limitLabel}</span>
              ) : null}
              <div class={this.$c('select-icon')}>
                {this.clearable && !this.isEmpty ? (
                  <Button
                    class={this.$c('select-clear')}
                    ui={this.uiParts.clear}
                    aria-label={this.t('clear')}
                    disabled={this.realDisabled || this.realReadonly}
                    // had to do so because of vuejs/jsx#77
                    {...{
                      on: {
                        click: this.clear,
                        '!keydown': stopPropagation,
                        '!mousedown': stopPropagation,
                        '!mouseup': stopPropagation
                      }
                    }}
                  >
                    <Icon name={this.icons.clear} />
                  </Button>
                ) : null}
                <Icon
                  class={this.$c('select-toggle')}
                  name={this.icons[this.realExpanded ? 'collapse' : 'expand']}
                />
              </div>
            </template>
          </Input>
        )}
        {
          <Overlay
            v-show={this.realExpanded}
            target="root"
            open={this.realExpanded}
            autofocus={!this.searchable}
            modal
            overlay-class={this.overlayClass}
            overlay-style={this.overlayStyle}
            local={this.realOverlayOptions.local}
            options={this.realOverlayOptions}
            match-width={this.isMatchWidth}
            onLocate={this.handleRelocate}
            onAfteropen={this.handleAfteropen}
          >
            <div
              id={this.dropdownId}
              ref="box"
              class={{
                [this.$c('select-options')]: true,
                [this.$c('select-options-multiple')]: this.multiple
              }}
              {...{
                directives: [
                  {
                    name: 'outside',
                    value: {
                      refs: this.outsideRefs,
                      handler: this.close
                    }
                  }
                ]
              }}
              tabindex="-1"
              ui={this.realUi}
              role="listbox"
              onKeydown={this.handleKeydown}
            >
              {renderSlot(this, 'before', this.slotProps)}
              {renderGroup(
                this.isFiltered
                  ? this.filteredOptions
                  : this.optionsWithSelectAll,
                this.isFiltered && !this.filteredOptions.length ? (
                  <div class={this.$c('select-options-no-data')}>
                    {renderSlot(this, 'no-data', {
                      keyword: this.inputValue
                    }) || this.t('noData')}
                  </div>
                ) : null,
                'render'
              )}
              {renderSlot(this, 'after', this.slotProps)}
            </div>
          </Overlay>
        }
      </div>
    )
  }
}

function stopPropagation (e) {
  e.stopPropagation()
}

function findOptionByValue (options, value) {
  return find(options, (item) => item.value === value, 'options')
}

function normalizeItem (item) {
  let options = (item.options || []).map(normalizeItem)
  let isGroup = options.length > 0
  return {
    ...item,
    ...(isGroup ? { options } : {})
  }
}
</script>

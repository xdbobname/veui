<template>
<article>
  <h1>
    <code>&lt;veui-config-provider&gt;</code>
  </h1>

  <section>
    <h3>配置 Select 的 placeholder</h3>
    <p>
      <code>select.placeholder:</code>
      <veui-input v-model="placeholder"/>
    </p>
    <veui-config-provider :value="contextValue">
      <veui-select :options="options" clearable/>
    </veui-config-provider>
  </section>

  <section>
    <h3>配置 Autocomplete 的搜索逻辑</h3>
    <p>
      <code>searchable.match/searchable.filter:</code>
      <veui-radio-group
        v-model="searchLogic"
        :items="searchItems"
        style="display: inline-block"
      />
    </p>
    <veui-config-provider :value="contextValue">
      <veui-autocomplete v-model="autoValue" :datasource="options" expanded/>
    </veui-config-provider>
  </section>
</article>
</template>

<script>
import { ConfigProvider, Select, Autocomplete, Input, RadioGroup } from 'veui'

export default {
  name: 'config-provider-demo',
  components: {
    'veui-config-provider': ConfigProvider,
    'veui-select': Select,
    'veui-input': Input,
    'veui-radio-group': RadioGroup,
    'veui-autocomplete': Autocomplete
  },
  data () {
    return {
      placeholder: undefined,
      autoValue: '大',
      searchLogic: ''
    }
  },
  computed: {
    options () {
      return [
        { label: '工程师培训', value: '12' },
        { label: '大数据培训班', value: '13' },
        { label: '双眼皮产品类', value: '14' },
        { label: '分散机', value: '15' },
        { label: '编码器', value: '16' },
        { label: '相亲中介', value: '17' }
      ]
    },
    searchItems () {
      return [
        { label: '默认', value: '' },
        { label: '全中无高亮', value: 'all_wh' },
        { label: '全中有高亮', value: 'all_h' }
      ]
    },
    contextValue () {
      return {
        // undefined 让默认 contextValue 生效
        'select.placeholder': this.placeholder || undefined,
        'searchable.filter': this.searchLogic === 'all_h' && (() => true),
        'searchable.match': this.searchLogic === 'all_wh' && (() => true)
      }
    }
  }
}
</script>

<style lang="less" scoped>
section {
  margin-bottom: 10px;
}
</style>

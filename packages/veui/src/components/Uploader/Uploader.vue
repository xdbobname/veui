<template>
<div
  ref="main"
  :class="{
    [$c('uploader')]: true,
    [$c(`uploader-${isMediaType ? 'media' : type}`)]: true
  }"
  :ui="realUi"
  role="application"
  tabindex="-1"
  :aria-label="t('uploader')"
>
  <component
    :is="`veui-uploader-${isMediaType ? 'media' : 'file'}`"
    :files="fileList"
    :addable="canAddImage"
    :disabled="realUneditable"
    :sortable="!realUneditable && sortable"
    :options="childOptions"
    @move="handleItemMove"
    @add="handleItemAdd"
    @replace="handleItemReplace"
    @remove="handleItemRemove"
    @preview="handleItemPreview"
    @custom="handleItemCustomEvent"
  >
    <template
      v-for="(_, slotName) in $scopedSlots"
      :slot="slotName"
      slot-scope="slotData"
    >
      <slot :name="slotName" v-bind="slotData"/>
    </template>
  </component>

  <veui-lightbox
    v-if="isMediaType"
    :open.sync="previewOpen"
    :datasource="successFiles"
    :index.sync="previewIndex"
    v-bind="realPreviewOptions"
  />
</div>
</template>

<script>
import {
  some,
  pick,
  includes,
  isString,
  identity,
  findIndex,
  find,
  omit,
  isNil,
  values,
  isUndefined,
  noop
} from 'lodash'
import prefix from '../../mixins/prefix'
import ui from '../../mixins/ui'
import input from '../../mixins/input'
import i18n from '../../mixins/i18n'
import { sharedProps } from './_mixin'
import config from '../../managers/config'
import { useConfigurable } from '../../mixins/config'
import toast from '../../managers/toast'
import warn from '../../utils/warn'
import { addOnceEventListener } from '../../utils/dom'
import { isSupportFileListContructor } from '../../utils/file'
import Lightbox from '../Lightbox'
import Icon from '../Icon'
import FileUploader from './_FileUploader'
import MediaUploader from './_MediaUploader'
import {
  STATUS,
  ORDERS,
  ERRORS,
  PickerPosition,
  HelpPosition,
  getFileMediaType,
  UploaderFile,
  getUploadRequest
} from './_helper'
import '../../common/global'

config.defaults(
  {
    requestMode: 'xhr',
    iframeMode: 'postmessage',
    callbackNamespace: 'veuiUploadResult',
    pickerPosition: 'after',
    convertResponse: identity,
    mediaExtensions: {
      image: [
        'apng',
        'avif',
        'bmp',
        'gif',
        'ico',
        'cur',
        'jpg',
        'jpeg',
        'jfif',
        'pjpeg',
        'pjp',
        'png',
        'svg',
        'tif',
        'tiff',
        'webp'
      ],
      video: ['mp4', 'mov', 'wmv', 'flv', 'avi', 'avchd', 'webm', 'mkv']
    }
  },
  'uploader'
)

export default {
  name: 'veui-uploader',
  status: STATUS,
  errors: ERRORS,
  components: {
    'veui-lightbox': Lightbox,
    'veui-uploader-file': FileUploader,
    'veui-uploader-media': MediaUploader
  },
  mixins: [
    prefix,
    ui,
    input,
    i18n,
    useConfigurable('config', {
      namespace: 'uploader',
      props: [
        'headers',
        'requestMode',
        'iframeMode',
        'convertResponse',
        'callbackNamespace',
        'pickerPosition'
      ]
    })
  ],
  model: {
    event: 'change'
  },
  props: {
    name: {
      type: String,
      default: 'file'
    },
    value: {
      type: [Array, Object]
    },
    type: {
      type: String,
      default: 'file',
      validator (value) {
        return includes(['file', 'media', 'image', 'video'], value)
      }
    },
    action: String,
    headers: {
      type: Object
    },
    withCredentials: {
      type: Boolean,
      default: true
    },
    requestMode: {
      type: String,
      validator (value) {
        return includes(['xhr', 'iframe', 'custom'], value)
      }
    },
    iframeMode: {
      type: String
    },
    convertResponse: {
      validator (value) {
        return typeof value === 'function'
      }
    },
    callbackNamespace: {
      type: String
    },
    dataType: {
      type: String,
      default: 'json',
      validator (value) {
        return includes(['json', 'text'], value)
      }
    },
    accept: String,
    validator: {
      type: Function
    },
    maxCount: {
      type: Number,
      default: Infinity
    },
    maxSize: [Number, String],
    payload: Object,
    autoupload: {
      type: Boolean,
      default: true
    },
    order: {
      type: String,
      validator (value) {
        return includes(values(ORDERS), value)
      }
    },
    multiple: {
      type: Boolean,
      default: false
    },
    sortable: Boolean,
    upload: Function,
    pick: Function,
    controls: Function,
    pickerPosition: {
      type: String,
      validator (value) {
        return includes(values(PickerPosition), value)
      }
    },
    pickerLabel: String,
    pickerIcon: Icon.props.name,
    validityDisplay: {
      type: String,
      default: 'popup',
      validator (value) {
        return includes(['popup', 'inline'], value)
      }
    },
    help: String,
    helpPosition: {
      type: String,
      default: 'side',
      validator (value) {
        return includes(values(HelpPosition), value)
      }
    },
    entries: Function,
    previewOptions: {
      type: Object,
      default () {
        return {
          wrap: true,
          indicator: 'number'
        }
      }
    },
    keyField: {
      type: String,
      default: 'key'
    },
    afterPick: Function
  },
  data () {
    return {
      fileList: [],

      previewIndex: 0,
      previewOpen: false
    }
  },
  computed: {
    realUneditable () {
      return this.realDisabled || this.realReadonly
    },
    canAddImage () {
      return !this.realUneditable && this.fileList.length < this.maxCount
    },
    status () {
      if (!this.fileList.length) {
        return STATUS.EMPTY
      }
      let status = find(
        [STATUS.UPLOADING, STATUS.FAILURE, STATUS.PENDING],
        (status) => this.fileList.some((file) => file.status === status)
      )
      return status || STATUS.SUCCESS
    },
    successFiles () {
      return this.fileList
        .filter((file) => file.isSuccess)
        .map((file) => file.value)
    },
    realOrder () {
      if (this.order) {
        return this.order
      }
      return this.type === 'file' ? ORDERS.PREPEND : ORDERS.APPEND
    },
    isMediaType () {
      return ['image', 'video', 'media'].indexOf(this.type) > -1
    },
    realAccept () {
      if (this.accept) {
        return this.accept
      }

      switch (this.type) {
        case 'media':
          return 'video/*, image/*'
        case 'image':
          return 'image/*'
        case 'video':
          return 'video/*'
      }
      return null
    },
    realPreviewOptions () {
      return omit(this.previewOptions, ['index', 'open'])
    },
    realMultiple () {
      return this.maxCount === 1 ? this.multiple : true
    },

    uploadRequest () {
      const options = {
        ...pick(this, [
          'name',
          'action',
          'withCredentials',
          'dataType',
          'payload',
          'upload'
        ]),
        headers: this.realHeaders,
        requestMode: this.realRequestMode,
        iframeMode: this.realIframeMode,
        callbackNamespace: this.realCallbackNamespace,
        convertResponse: this.realConvertResponse
      }
      return getUploadRequest(options)
    },
    validateOptions () {
      return {
        type: this.type,
        accept: this.realAccept,
        extensions: this.config['uploader.mediaExtensions'],
        maxSize: this.maxSize,
        validator: this.validator
      }
    },
    childOptions () {
      let options = pick(this, sharedProps)
      options.pickerPosition = this.realPickerPosition
      options.multiple = this.realMultiple
      options.order = this.realOrder
      return options
    },
    preferType () {
      return includes(['image', 'video'], this.type) ? this.type : undefined
    },
    canMultipleChoose () {
      return this.realRequestMode !== 'iframe' || isSupportFileListContructor()
    },
    valueAndMaxCount () {
      return {
        value: this.value,
        maxCount: this.maxCount
      }
    }
  },
  watch: {
    valueAndMaxCount: {
      handler ({ value: val, maxCount }) {
        // 并不是 value 变化了才更新 fileList
        let values = [].concat(val).filter(Boolean)
        if (process.env.NODE_ENV !== 'test') {
          if (some(values, (val) => isString(val))) {
            warn('[veui-uploader] `value` must be object(s).', this)
          }
          if (some(values, (val) => isNil(val[this.keyField]))) {
            warn(
              '[veui-uploader] `key-field` is required of `value` to ensure correct order.',
              this
            )
          }
        }

        let j = 0
        this.fileList = this.fileList
          .map((file) => {
            if (!file.isSuccess) {
              return file
            }

            let value = values[j++]
            if (!value) {
              // prop value array 用完了
              return
            }

            if (value[this.keyField]) {
              let file = find(
                this.fileList,
                (file) => file.key === value[this.keyField]
              )
              // file.value 对应 value array 中的元素
              if (file) {
                file.value = value // 会同步设置 status 为成功
                return file
              }
            }

            return this.createUploaderFile(value)
          })
          .filter(Boolean)
          .concat(
            // 还有剩的添加到最后（TODO: 需要考虑 order 么？）
            values.slice(j).map((val) => this.createUploaderFile(val))
          )

        // fileList 不能超过 maxCount，若超过，先删除失败的，再删除上传中的，最后删除成功的
        if (this.fileList.length > maxCount) {
          // 成功..上传中..失败排序
          let sorted = [...this.fileList].sort((a, b) => {
            if (
              (a.isSuccess && !b.isSuccess) ||
              (a.isUploading && b.isFailure)
            ) {
              return -1
            }
            if (
              (b.isSuccess && !a.isSuccess) ||
              (b.isUploading && a.isFailure)
            ) {
              return 1
            }
            // 返回原来的顺序
            return this.fileList.indexOf(a) - this.fileList.indexOf(b)
          })
          this.fileList = this.fileList.filter(
            (file) => sorted.indexOf(file) < maxCount
          )
          // 要取消上传中的
          sorted.slice(maxCount).forEach((file) => {
            if (file.isUploading) {
              file.cancel()
            }
          })
        }
      },
      deep: true,
      immediate: true
    },
    status (val) {
      if (val) {
        this.$emit('statuschange', val)
      }
    }
  },
  created () {
    if (this.realRequestMode !== 'custom' && !this.action) {
      warn(
        '[veui-uploader] `action` is required when `request-mode` is not `custom`.',
        this
      )
    }
  },
  mounted () {
    this.fileInput = this.createInputElement()
    this.$refs.main.appendChild(this.fileInput)
  },
  beforeDestroy () {
    this.cancelAll()
  },
  methods: {
    preview (index) {
      let successFileIndex = findIndex(
        this.successFiles,
        (val) => val[this.keyField] === this.fileList[index].key
      )
      this.previewIndex = successFileIndex
      this.previewOpen = true
    },
    cancelAll () {
      this.fileList.forEach((file) => file.cancel())
    },
    clear () {
      this.fileList.forEach((file) => {
        if (file.isFailure) {
          this.removeFile(this.fileList.indexOf(file))
        }
      })
    },
    prune () {
      this.fileList.forEach((_, index) => this.removeFile(index))
    },
    focus () {
      this.$el.focus()
    },

    handleItemMove (fromIndex, toIndex) {
      let { fileList } = this
      let item = fileList[fromIndex]
      fileList.splice(fromIndex, 1)
      fileList.splice(toIndex, 0, item)

      this.$emit('change', this.getValueForChange(this.successFiles))
    },

    handleItemAdd () {
      this.chooseFiles()
    },
    handleItemRemove (index) {
      this.removeFile(index)
    },
    handleItemReplace (index) {
      // TODO: pickFiles 异步回调后可能 fileList index 已经变了
      this.pickFiles(false).then((files) => {
        this.replaceFile(index, files[0])
      })
    },
    handleItemPreview (index) {
      this.preview(index)
    },
    handleItemCustomEvent (name, index) {
      if (isUndefined(index)) {
        return this.$emit(name)
      }
      this.$emit(name, this.getValueWithStatus(this.fileList[index]))
    },

    createInputElement () {
      let el = document.createElement('input')
      el.type = 'file'
      el.hidden = true
      return el
    },
    pickFiles (multiple) {
      if (this.removePreviousFileInputHandler) {
        this.removePreviousFileInputHandler()
      }

      let input = this.fileInput
      input.accept = this.realAccept
      input.multiple = this.canMultipleChoose && multiple

      let cancelFunctions = []
      let promise = new Promise((resolve, reject) => {
        let remove = addOnceEventListener(input, 'change', ({ target }) => {
          let files = [...target.files]
          if (!this.canMultipleChoose) {
            // IE 11 兼容: 保留 input 和 FileList
            let file = files[0]
            file._rawFileList = target.files
            files = [file]
            input = this.fileInput = this.createInputElement()
          }
          resolve(files)
          input.value = null
        })
        cancelFunctions.push(remove)
        cancelFunctions.push(reject)
      })
      this.removePreviousFileInputHandler = () =>
        cancelFunctions.forEach((c) => c())

      input.click()
      return !this.afterPick
        ? promise
        : promise.then((files) => this.afterPick(files))
    },
    chooseFiles () {
      let restCount = this.maxCount - this.fileList.length
      const promise =
        typeof this.pick === 'function'
          ? this.pick.call(null, {
            remainingCount: restCount
          }) // 不给this
          : this.pickFiles(restCount > 1)
      promise
        .then((files) => {
          if (files && !Array.isArray(files)) {
            files = [files]
          }
          if (!files.length) {
            return
          }
          this.addFiles(files)
        })
        .catch(noop)
    },
    addFiles (files) {
      const count = this.fileList.length + files.length
      if (count > this.maxCount) {
        const message = this.t('tooManyFiles')
        toast.error(message)
        this.$emit('invalid', {
          errors: [
            {
              type: ERRORS.TOO_MANY_FILES,
              value: count,
              message
            }
          ]
        })
        return
      }
      files = files.map((file) => this.createUploaderFile(file))
      this.fileList =
        this.realOrder === ORDERS.PREPEND
          ? files.concat(this.fileList)
          : this.fileList.concat(files)

      if (this.autoupload) {
        this.startUpload()
      }
    },
    startUpload () {
      this.fileList.forEach((file) => this.uploadFile(file))
    },
    uploadFile (file) {
      if (!file.isPending) {
        return
      }

      file.isUploading = true
      return file
        .validate(this.validateOptions, this)
        .then((errors) => {
          if (!errors) {
            return
          }
          this.$emit('invalid', { file: file.native, errors })
          file.message = errors
            .map(({ message }) => message)
            .join(this.t('separator'))
          file.preview = errors.some(({ preview }) => !!preview)
          throw new Error('validate failed') // skip to next catch block
        })
        .then(() => {
          // validate success, start to upload
          return file.upload(this, {
            onprogress: (evt) => {
              if (evt.loaded < 0) {
                return
              }
              this.$emit(
                'progress',
                this.getValueWithStatus(file),
                this.fileList.indexOf(file),
                evt
              )
            },
            oncancel: () =>
              this.removeFile(this.fileList.indexOf(file), { restore: true })
          })
        })
        .then(() => STATUS.SUCCESS)
        .catch((err) => {
          if (err.__CANCEL__) {
            throw err
          }
          return STATUS.FAILURE
        })
        .then((status) => {
          this.updateFileStatus(this.fileList.indexOf(file), status)
        })
        .catch((err) => {
          warn(`[veui-uploader] File upload failed: ${err.message}`, this)
        })
    },
    updateFileStatus (index, status) {
      if (index < 0 || index >= this.fileList.length) {
        return
      }
      const isSuccess = status === STATUS.SUCCESS
      // 需要保证事件顺序：先 change，再 statuschange (重构前逻辑)
      // 修改 file.status 就会触发 watch:status emit statuschange
      // 因此需要先在局部构造 change value，触发 change 后，再修改 file.status
      let successFiles = this.fileList
        .map((file, i) => {
          if ((i === index && isSuccess) || file.isSuccess) {
            return file.value
          }
        })
        .filter(Boolean)

      if (isSuccess) {
        this.$emit('change', this.getValueForChange(successFiles))
      }
      this.$emit(status, { ...this.fileList[index].value, status }, index)
      this.fileList[index].status = status
    },
    replaceFile (index, file) {
      let newFile = this.createUploaderFile(file)
      newFile._replacing = this.fileList.splice(index, 1, newFile)[0]
      this.uploadFile(newFile)
    },
    removeFile (index, { restore = false } = {}) {
      if (index < 0 || index >= this.fileList.length) {
        return
      }

      let file = this.fileList[index]
      file.cancel()

      let files = this.fileList
        .map(function (file, i) {
          if (i === index) {
            return restore && file._replacing ? file._replacing : null
          }
          return file
        })
        .filter(Boolean)

      // 跟 updateFileStatus 相同，也需要保证顺序
      if (file.isSuccess || (restore && file._replacing)) {
        let successFiles = files
          .map(function (file) {
            return file.isSuccess ? file.value : null
          })
          .filter(Boolean)
        this.$emit('change', this.getValueForChange(successFiles))
      }

      this.$emit('remove', this.getValueWithStatus(file), index)
      this.fileList = files
    },

    getValueForChange (files) {
      return this.realMultiple ? files : files[0] || null
    },
    getValueWithStatus (file) {
      return { ...file.value, status: file.status }
    },
    guessFileType (val) {
      return (
        this.preferType ||
        getFileMediaType(val, this.config['uploader.mediaExtensions'])
      )
    },
    createUploaderFile (val, file) {
      const options = {
        keyField: this.keyField,
        extensions: this.config['uploader.mediaExtensions']
      }
      if (process.env.VUE_ENV !== 'server' && val instanceof File) {
        return new UploaderFile(val, options)
      }

      if (file) {
        file.keyField = this.keyField
        file.value = val
      } else {
        file = UploaderFile.fromValue(val, options)
      }
      let guessType = this.guessFileType(val)
      if (!val.type && guessType !== file.type) {
        file.type = guessType
      }
      return file
    },

    triggerUpload () {
      warn(
        '[veui-uploader] `triggerUpload` is deprecated and will be removed in future versions. Use `startUpload` instead.',
        this
      )
      this.startUpload()
    }
  }
}
</script>

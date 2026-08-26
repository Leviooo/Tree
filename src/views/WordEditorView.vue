<script setup lang="ts">
import { ref } from 'vue'
import WordEditor from '@/components/WordEditor.vue'

const html = ref(
  '<h1>示例文档</h1>' +
    '<p>这是一段<b>示例</b>文本，包含<i>斜体</i>、<u>下划线</u>和<s>删除线</s>，可直接编辑。</p>' +
    '<ul><li>支持标题、<b>加粗</b>、列表、表格、图片</li><li>可导入 .docx 文件继续编辑</li><li>可导出为 .docx 下载</li></ul>' +
    '<h2>表格示例</h2>' +
    '<table><tr><th>项目</th><th>说明</th></tr><tr><td>导入</td><td>mammoth 将 .docx 转为 HTML</td></tr><tr><td>导出</td><td>docx 将 HTML 转为 .docx</td></tr></table>',
)
</script>

<template>
  <main class="wrap">
    <h1 class="title">Word 在线编辑器</h1>
    <WordEditor v-model="html" />
  </main>
</template>

<style scoped>
.wrap {
  max-width: 1080px;
  padding: 24px 16px 48px;
  margin: 0 auto;
}

.title {
  margin: 0 0 16px;
  font-size: 20px;
  color: #1f2328;
}
</style>

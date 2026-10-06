import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Vite emits these workers alongside the editor; no runtime CDN is required.
globalThis.MonacoEnvironment = {
  getWorker(_moduleId, language) {
    if (language === 'json') return new JsonWorker()
    if (['css', 'scss', 'less'].includes(language)) return new CssWorker()
    if (['html', 'handlebars', 'razor'].includes(language)) return new HtmlWorker()
    if (['typescript', 'javascript'].includes(language)) return new TypeScriptWorker()
    return new EditorWorker()
  },
}
loader.config({ monaco })

export default function LocalCodeEditor(props) {
  return <Editor {...props} loading={<div className="loading" role="status">正在加载编辑器…</div>}/>
}

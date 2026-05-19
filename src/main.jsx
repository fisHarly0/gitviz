import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// 注：去掉 <StrictMode> — @gitgraph/react 用 imperative API (gitgraph.branch / .commit)，
// StrictMode 双 mount 会导致每个 commit 被注册两次，触发 React duplicate key 警告 + SVG 渲染异常
createRoot(document.getElementById('root')).render(<App />)

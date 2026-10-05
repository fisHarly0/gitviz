import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extension = path.join(root, 'extensions/vscode')
const manifest = JSON.parse(await fs.readFile(path.join(extension, 'package.json'), 'utf8'))
const zip = new JSZip()
const files = ['package.json', 'extension.cjs', 'git-service.cjs', 'operation-journal.cjs', 'README.md', 'media/tree.js', 'media/tree.css']
for (const file of files) zip.file(`extension/${file}`, await fs.readFile(path.join(extension, file)))
const notices = []
for (const name of ['react', 'react-dom', 'scheduler']) {
  const directory = path.join(root, 'node_modules', name)
  const pkg = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
  notices.push(`${name} ${pkg.version}\n${await fs.readFile(path.join(directory, 'LICENSE'), 'utf8')}`)
}
zip.file('extension/THIRD_PARTY_NOTICES.txt', notices.join('\n\n--------------------\n\n'))
zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="css" ContentType="text/css"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>')
zip.file('extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="zh-CN" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}"/><DisplayName>Gitviz · 版本树</DisplayName><Description xml:space="preserve">Interactive Git save-point tree</Description><Tags>git,graph,worktree</Tags><Categories>SCM Providers,Visualization</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>`)
const output = path.join(process.env.GITVIZ_ARTIFACTS_DIR ? path.resolve(process.env.GITVIZ_ARTIFACTS_DIR) : path.join(root, 'artifacts'), `gitviz-${manifest.version}.vsix`)
await fs.mkdir(path.dirname(output), { recursive: true })
await fs.writeFile(output, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log(output)

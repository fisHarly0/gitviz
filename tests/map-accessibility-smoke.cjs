// Actual VS Code Webview, isolated profile and real Git history. No standalone browser.
/* global document, window */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core')
const { setTimeout: delay } = require('node:timers/promises')
const root = process.env.GITVIZ_MAP_A11Y_ROOT, phase = process.env.GITVIZ_MAP_A11Y_PHASE || 'verified'
assert.ok(root && path.isAbsolute(root), 'isolated absolute test root required')
assert.match(phase, /^[a-z0-9-]+$/, 'safe evidence directory name')
assert.ok(process.env.GITVIZ_AXE_PATH && path.isAbsolute(process.env.GITVIZ_AXE_PATH), 'absolute axe-core script required')
const until = async (check,label) => { const end=Date.now()+45000; while(Date.now()<end) { if(await check())return; await delay(100) } throw Error('Timed out: '+label) }
;(async()=>{
 await until(()=>fetch('http://127.0.0.1:9235/json/version').then(r=>r.ok,()=>false),'VS Code CDP');
 const browser=await chromium.connectOverCDP('http://127.0.0.1:9235')
 try {
 const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('vscode-file:'))
 assert.ok(page); await page.locator('.monaco-workbench').waitFor(); await page.bringToFront(); await page.locator('.monaco-workbench').click({position:{x:300,y:100}})
 for(const name of ['Continue without Signing In','Continue','Get Started']) { const b=page.getByRole('button',{name,exact:true}); if(await b.isVisible())await b.click() }
 await page.keyboard.press('Escape'); await page.keyboard.press('F1')
 await page.locator('.quick-input-widget input').fill('>Gitviz: 打开交互式版本树')
 await page.locator('.quick-input-list .monaco-list-row').filter({hasText:'Gitviz: 打开交互式版本树'}).first().click()
 let surface
 await until(async()=>{ for(const f of page.frames())if(await f.locator('.version-tree').count()){surface=f;return true} },'extension frame')
 await surface.locator('.save-node').first().waitFor()
 const axe=await fs.readFile(process.env.GITVIZ_AXE_PATH,'utf8')
 const {GitService}=require('../extensions/vscode/git-service.cjs'); const fixture=JSON.parse(await fs.readFile(path.join(root,'fixture.json'),'utf8')); const relative=path.relative(root,fixture.root); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'fixture stays inside isolated root'); const git=await GitService.open(fixture.root); const before={head:await git.head(),status:await git.status(),refs:await git.command(['show-ref'])}; const checks=[]; const output=path.join(root,phase); await fs.mkdir(output,{recursive:true})
 const audit=async(name)=>{
  await surface.evaluate(axe)
  const report=await surface.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}))
  await fs.writeFile(path.join(output,name+'.json'),JSON.stringify(report,null,2))
  console.log(name,JSON.stringify(report.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))))
  await surface.locator('.version-tree').screenshot({path:path.join(output,name+'.png')}); assert.deepEqual(report.violations,[],name+' has no violations'); assert.equal(report.incomplete.some(v=>v.id==='aria-prohibited-attr'),false,name+' has valid named roles')
 }
 const settingsPath=path.join(root,'profile/User/settings.json'), settings=JSON.parse(await fs.readFile(settingsPath,'utf8'))
 for(const [theme,category] of [['Dark Modern','dark'],['Light Modern','light'],['Default High Contrast','high-contrast'],['Default High Contrast Light','high-contrast-light']]) {
  await fs.writeFile(settingsPath,JSON.stringify({...settings,'workbench.colorTheme':theme},null,2))
  await until(async()=>{ for(const f of page.frames()) if(await f.locator('.version-tree').count()){ surface=f; return surface.evaluate(category=>document.body.classList.contains('vscode-'+category),category) } },'theme '+category)
  await delay(200)
  await surface.getByRole('group',{name:'版本地图画布',exact:true}).press('Home'); await delay(200); await audit(category+'-map')
  await surface.locator('.tree-search input').fill('save 01999')
  await until(()=>surface.locator('.save-node.muted').count(),'muted nodes'); await surface.locator('.history-hit').first().waitFor(); await until(async()=> /[0-9]+ 个结果/.test(await surface.locator('.history-results [role=status]').innerText()),'settled search')
  await audit(category+'-search')
  await surface.locator('.tree-search input').fill(''); await delay(250)
  const canvas=surface.getByRole('group',{name:'版本地图画布',exact:true})
  await canvas.press('End'); await until(async()=>await surface.locator('.save-node.selected').getAttribute('data-oid') !== fixture.head,'end selects history')
  await canvas.press('Home'); await surface.getByRole('button',{name:'当前位置',exact:true}).press('Enter')
  await until(async()=>await surface.locator('.save-node.selected').getAttribute('data-oid') === fixture.head,'return to actual HEAD')
  await until(()=>surface.locator('.save-node.selected').evaluate(e=>e===document.activeElement),'HEAD focus settled');
  const toggle=surface.getByRole('button',{name:'分支与标签',exact:true}); await toggle.press('Enter')
  await surface.getByLabel('查找分支或标签',{exact:true}).press('Escape')
  assert.equal(await toggle.evaluate(e=>e===document.activeElement),true,'Escape restores focus')
  await surface.getByRole('button',{name:'缩小',exact:true}).press('Enter')
  await until(async()=>await surface.locator('.zoom-controls output').innerText()==='85%','zoom applied'); console.log('zoom-focus',await surface.evaluate(()=>({tag:document.activeElement.tagName,label:document.activeElement.getAttribute('aria-label'),oid:document.activeElement.dataset.oid}))); assert.equal(await surface.getByRole('button',{name:'缩小',exact:true}).evaluate(e=>e===document.activeElement),true,'zoom retains focus')
  await surface.getByRole('button',{name:'放大',exact:true}).press('Enter')
  await page.setViewportSize({width:960,height:700}); await delay(150)
  assert.equal(await surface.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),true,'no horizontal overflow')
  await audit(category+'-narrow')
  await page.setViewportSize({width:1280,height:900}); checks.push(category)

 }
 assert.deepEqual({head:await git.head(),status:await git.status(),refs:await git.command(['show-ref'])},before,'navigation is read-only'); await fs.writeFile(path.join(output,'result.json'),JSON.stringify({themes:checks,keyboardAndFocus:true,gitUnchanged:true},null,2));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {buildSync}=require('esbuild');
const m={exports:{}};
vm.runInNewContext(buildSync({entryPoints:['src/shared/ui-i18n.js'],bundle:true,write:false,format:'cjs'}).outputFiles[0].text,{module:m,exports:m.exports});
const {translateUiText:t,normalizeUiLanguage,DEFAULT_UI_LANGUAGE}=m.exports;

test('language defaults and unsupported preferences resolve deterministically',()=>{
 assert.equal(DEFAULT_UI_LANGUAGE,'en');assert.equal(normalizeUiLanguage('zh'),'zh-CN');
 for(const value of [undefined,null,'fr','en-US'])assert.equal(normalizeUiLanguage(value),'en');
});
test('controls in both original and added panels have bilingual labels',()=>{
 for(const [en,zh]of [['Auto Job Solver','自动任务'],['Markets','市场'],['Loadout','配置'],['All Failed','清理全部失败任务'],['Auto Decrypt Hacking','自动破解 Decrypt'],['Auto ICE Wall Hacking','自动破解 ICE Wall']]){
  assert.notEqual(t(en,'zh-CN'),en,en);
 }
 for(const source of ['远征','当前远征','掉落出售','仓库满出售','出售非无人机','全出售','个人无人机组装','自动领取远征奖励邮件'])assert.ok(!/[\u3400-\u9fff]/.test(t(source,'en')),source);
 assert.equal(t('▶ Start Auto Jobs','zh-CN').startsWith('▶ '),true);
});
test('dynamic statuses preserve counts, software names, IDs and file extensions',()=>{
 assert.equal(t('Reputation — Level 5','zh-CN'),'声望 — 等级 5');
 assert.equal(t('Items List (13)','zh-CN'),'物品列表（13）');
 assert.equal(t('物品列表（13）','en'),'Items List (13)');
 assert.equal(t('正在派遣 Zero，费用 1995 CR；等待服务器确认','en'),'Sending Zero, cost 1995 CR; awaiting server confirmation');
 const result=t('Cleanup verified: 7 failed job(s) dismissed; 2 remaining or unverified.','zh-CN');
 assert.ok(result.includes('7')&&result.includes('2'));assert.ok(result.includes('清理'));
 assert.equal(t('Minigame locked (~13m remaining)','zh-CN'),'小游戏已锁定（约剩余 13m）');
 assert.equal(t('下次派遣检查：13:30:00 · 0h:30m:0s','en'),'Next dispatch check: 13:30:00 · 0h:30m:0s');
});
test('Chinese workflow failure states translate without changing operational source data',()=>{
 for(const source of ['佣兵刷新超时，未使用旧缓存','邮箱仍有待领取附件，已停止派遣','最新费用超过上限，未派遣','远征模块已暂停，本轮操作已取消']){
  const en=t(source,'en');assert.notEqual(en,source);assert.equal(t(en,'zh-CN'),source);
 }
});
test('proper names and raw protocol fragments are never subject to broad substitution',()=>{
 for(const source of ['Zero','5CRYPt0L 09','5CRYPt0L 0J','.eb54x','High-load auxiliary cable','019e4065-6ae8-760d-8724-58ab4f2cf7d7','42["desktop",{"action":"get.options","status":"FAILED"}]']){
  assert.equal(t(source,'zh-CN'),source);assert.equal(t(source,'en'),source);
 }
 assert.equal(t('Search','zh-CN'),'搜索');assert.equal(t('5h','zh-CN'),'5h');
});

test('duration formatting cannot match the m or s inside real panel and market labels',()=>{
 const expected=[['📌 Pinned Timers','📌 固定倒计时'],['🏪 Markets','🏪 市场'],['CORE Market Jobs','CORE 市场任务'],['BMI-ZEN Market Jobs','BMI-ZEN 市场任务'],['SOYUZ RM7 Market Jobs','SOYUZ RM7 市场任务'],['USOL RM7 Market Jobs','USOL RM7 市场任务']];
 for(const [en,zh]of expected)assert.equal(t(en,'zh-CN'),zh);
 const label=t('֎ Automation/QoL Toggles','zh-CN');assert.ok(!label.includes('分钟')&&!label.includes('秒'));
 for(const value of ['3h:46m:20s','03:46:20','3h 46m 20s','46m 20s','5h','59s','2d 3h 0m 9s']){
  assert.equal(t(value,'zh-CN'),value);assert.equal(t(value,'en'),value);
  assert.ok(t('⏳ Jobs Reset: '+value,'zh-CN').endsWith(value));
 }
 for(const value of ['Pinned Timers','Markets','Automation/QoL Toggles','SOYUZ RM7 Market Jobs'])assert.ok(!/[分秒]/.test(t(value,'zh-CN')));
});

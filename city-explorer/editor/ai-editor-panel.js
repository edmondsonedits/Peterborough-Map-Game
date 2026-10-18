/** Same JSON command transport for people, browser automation and isolated worlds. */
export function installAIEditorPanel(root, tools) {
  if (!root) return {dispose(){}};
  root.innerHTML = `<details class="ai-editor-tools"><summary>AI tools</summary>
    <p>Find a feature, inspect its supported settings, then make an undoable edit.</p>
    <label>Find city features<input data-ai-search type="search" placeholder="Hunter, building, source ID…" maxlength="200"></label>
    <div class="ai-editor-row"><button type="button" data-ai-find>Find</button><button type="button" data-ai-inspect>Inspect selected</button><button type="button" data-ai-focus>Focus</button></div>
    <div data-ai-results class="ai-editor-results" aria-label="Matching city features"></div>
    <div class="ai-editor-row"><button type="button" data-ai-copy>Copy context</button><button type="button" data-ai-help>Commands</button></div>
    <label>View name<input data-ai-view-name type="text" maxlength="80" placeholder="Bridge side"></label>
    <div class="ai-editor-row"><button type="button" data-ai-save-view>Save view</button><select data-ai-views aria-label="Saved camera views"></select><button type="button" data-ai-restore-view>Restore view</button></div>
    <label>JSON command<textarea data-ai-command spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="AI editor JSON command">{"op":"list","query":"Hunter","limit":10}</textarea></label>
    <button type="button" data-ai-run>Run command</button>
    <p data-ai-note role="status" aria-live="polite"></p>
    <output data-ai-result aria-label="AI editor command result" tabindex="0"></output>
  </details>`;
  const find = selector => root.querySelector(selector), listeners = [];
  const on = (selector,event,fn) => {const node=find(selector);node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));};
  function views() {
    const response=tools.run({op:'view.list'});if(!response.ok)return;
    const select=find('[data-ai-views]'),value=select.value;select.replaceChildren();
    response.data.forEach(({name})=>{const option=document.createElement('option');option.value=name;option.textContent=name;select.append(option);});
    if(response.data.some(item=>item.name===value))select.value=value;
  }
  function show(response) {
    find('[data-ai-result]').textContent=JSON.stringify(response,null,2);
    find('[data-ai-result]').dataset.ok=String(response.ok);
    find('[data-ai-note]').textContent=response.ok
      ? response.data?.persisted===false ? 'View kept for this session; browser storage is unavailable.' : 'Command complete. Scene edits use Undo and local drafts.'
      : response.error.message;
    if(response.ok)views();return response;
  }
  function run(command){return show(tools.run(command));}
  on('[data-ai-run]','click',()=>run(find('[data-ai-command]').value));
  function search(){
    const response=run({op:'list',query:find('[data-ai-search]').value,limit:20});
    const results=find('[data-ai-results]');results.replaceChildren();
    if(!response.ok)return;
    const total=document.createElement('p');total.textContent=`${response.data.total} matches · showing ${response.data.items.length}`;results.append(total);
    response.data.items.forEach(item=>{const button=document.createElement('button');button.type='button';button.dataset.aiFeatureId=item.id;button.textContent=`${item.label} · ${item.type}`;button.addEventListener('click',()=>run({op:'select',id:item.id}));results.append(button);});
  }
  on('[data-ai-find]','click',search);
  on('[data-ai-search]','keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  on('[data-ai-inspect]','click',()=>run({op:'inspect'}));
  on('[data-ai-focus]','click',()=>run({op:'focus'}));
  on('[data-ai-help]','click',()=>run({op:'help'}));
  on('[data-ai-save-view]','click',()=>{const response=run({op:'view.save',name:find('[data-ai-view-name]').value});if(response.ok)find('[data-ai-views]').value=response.data.name;});
  on('[data-ai-restore-view]','click',()=>run({op:'view.restore',name:find('[data-ai-views]').value}));
  on('[data-ai-copy]','click',async()=>{
    const response=run({op:'context'});if(!response.ok)return;
    try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(JSON.stringify(response,null,2));find('[data-ai-note]').textContent='Context copied.';}
    catch{find('[data-ai-note]').textContent='Copy unavailable. Select the JSON result below to copy it.';}
  });
  on('details','toggle',()=>{if(find('details').open)views();});
  return {dispose(){listeners.forEach(remove=>remove());root.replaceChildren();}};
}

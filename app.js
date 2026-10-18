import {NetworkView} from './graph.js';
const $=id=>document.getElementById(id);
const names={degree:'度中心性',betweenness:'介数中心性',closeness:'接近中心性'};
const descriptions={degree:'直接连接的邻居越多，度中心性越高。它衡量局部连接，不使用边权。',betweenness:'越多节点之间的最短路径经过这里，介数中心性越高。等长路径按比例分摊贡献。',closeness:'到其他节点的平均最短距离越小，接近中心性越高。这里的距离采用关系强度的倒数。'};
const formulas={degree:'C(v) = degree(v) / (N − 1)',betweenness:'C(v) ∝ Σ σ(s,t | v) / σ(s,t)',closeness:'C(v) = (N − 1) / Σ distance(v,u)'};
const types={Domain:'域名',IP:'IP 地址',Whois_Email:'邮箱',Whois_Phone:'电话',Whois_Name:'注册人',Cert_SHA256:'证书',IP_CIDR:'网段',ASN:'自治系统'};
let data=null,metric='degree',selected=null;
const scaleModes={degree:'sqrt',betweenness:'sqrt',closeness:'linear'};
const format=v=>v===0?'0':(Math.abs(v)<.0001?v.toExponential(2):v.toFixed(4));
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;return e};
const view=new NetworkView($('network'),choose);
function choose(id){
  const fromRank=document.activeElement?.classList.contains('rank-row');
  selected=id;render();
  if(id){const list=$('rank-list'),row=list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if(row){const top=row.offsetTop;if(top<list.scrollTop||top+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=top;
      if(fromRank)row.focus({preventScroll:true});}}
}
function matchingNodes(){const q=$('search').value.trim().toLowerCase(),type=$('type').value;return data.nodes.filter(n=>(!type||n.type===type)&&(!q||n.id.toLowerCase().includes(q)||n.type.toLowerCase().includes(q)||(types[n.type]||'').includes(q)))}
function render(){
  if(!data)return;
  document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
  const scaleMode=scaleModes[metric];
  document.querySelectorAll('[data-scale]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scale===scaleMode)));
  $('scale-description').textContent={linear:'线性：按全图最低至最高分的比例映射颜色和半径。',sqrt:'开方：对全图分数比例开方，增强中低分节点的颜色和大小。',rank:'排名占比：按全图分数排名的百分位映射颜色和半径；同分取平均名次，显示相同。'}[scaleMode];
  $('scale-description').textContent+=' 不改变分数与排名。';
  $('metric-description').textContent=descriptions[metric];$('metric-formula').textContent=formulas[metric];$('rank-metric').textContent=names[metric];
  const matches=matchingNodes(),ids=new Set(matches.map(n=>n.id));
  const all=[...data.nodes].sort((a,b)=>b.centrality[metric]-a.centrality[metric]||a.id.localeCompare(b.id,undefined,{numeric:true}));
  const rank=new Map(all.map((n,i)=>[n.id,i+1]));
  const rows=document.createDocumentFragment();
  all.filter(n=>ids.has(n.id)).forEach(n=>{const li=document.createElement('li'),button=document.createElement('button');button.className='rank-row';button.dataset.id=n.id;button.setAttribute('aria-pressed',String(n.id===selected));button.setAttribute('aria-label',`第${rank.get(n.id)}名，节点${n.id}，${types[n.type]||n.type}，${names[metric]} ${format(n.centrality[metric])}`);button.append(text('span',String(rank.get(n.id)).padStart(2,'0'),'position'));const identity=text('span',`节点 ${n.id}`,'identity');identity.append(text('small',types[n.type]||n.type));button.append(identity,text('span',format(n.centrality[metric]),'value'));button.onclick=()=>choose(n.id);li.append(button);rows.append(li)});
  $('rank-list').replaceChildren(rows);$('rank-empty').hidden=matches.length>0;$('rank-list').hidden=matches.length===0;
  $('result-count').textContent=`${matches.length} 个节点`;$('clear').disabled=!selected;
  const values=data.nodes.map(n=>n.centrality[metric]);$('range').textContent=`范围 ${format(Math.min(...values))} – ${format(Math.max(...values))}`;
  view.update(metric,selected,ids,scaleMode);renderDetails();
}
function renderDetails(){
  const holder=$('detail-content');holder.replaceChildren();
  const n=data.nodes.find(n=>n.id===selected);
  if(!n){$('detail-type').textContent='等待选择';holder.append(text('p','从网络或排名中选择一个节点，比较它的三种中心性，查看直接相连的对象。','detail-empty'));return}
  $('detail-type').textContent=types[n.type]||n.type;
  const head=document.createElement('div');head.className='node-title';head.append(text('strong',`节点 ${n.id}`),text('span',`${n.degree} 个直接邻居`));holder.append(head);
  const scores=document.createElement('dl');scores.className='score-grid';Object.entries(names).forEach(([key,name])=>{const cell=document.createElement('div');if(key===metric)cell.className='active';cell.append(text('dt',name),text('dd',format(n.centrality[key])));scores.append(cell)});holder.append(scores);
  holder.append(text('p','相邻节点 · 点击继续探索','neighbors-title'));
  const neighbors=document.createElement('div');neighbors.className='neighbors';n.neighbors.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).forEach(id=>{const b=text('button',id);b.setAttribute('aria-label',`查看邻居节点 ${id}`);const edge=data.links.find(l=>(l.source===id&&l.target===n.id)||(l.target===id&&l.source===n.id));b.title=edge?`${edge.relations.join(' / ')} · 强度 ${edge.strength}`:'';b.onclick=()=>choose(id);neighbors.append(b)});if(!n.neighbors.length)neighbors.append(text('span','没有直接邻居'));holder.append(neighbors);
  const attrs=Object.entries(n.attributes).filter(([key,value])=>key!=='page'&&value!==''&&value!==null).map(([key,value])=>`${key}：${typeof value==='boolean'?(value?'是':'否'):String(value)}`);
  if(attrs.length)holder.append(text('p',attrs.join(' · '),'attrs'));
  const relationTypes=[...new Set(data.links.filter(l=>l.source===n.id||l.target===n.id).flatMap(l=>l.relations))];holder.append(text('p',`关联类型：${relationTypes.join('、')||'无'}`,'attrs'));
}
async function load(){
  $('reload').disabled=true;$('reload').textContent='计算中…';$('notice').className='notice';$('notice').textContent='正在计算三种中心性…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const graphUrl=location.hostname.endsWith('github.io')?'./data/graph.json':'/api/graph';
    const response=await fetch(graphUrl,{signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'计算失败');
    if(!Array.isArray(result.nodes)||!Array.isArray(result.links))throw new Error('返回数据格式不正确');
    data=result;selected=null;const m=data.metadata;
    $('summary').textContent=`${m.node_count} 个节点 · ${m.edge_count} 条连接`;
    $('notice').textContent=`完整网络已就绪。切换指标，观察同一张图的颜色、大小和排名如何变化。`;
    $('runtime').textContent=`计算耗时 ${m.elapsed_ms} ms · Python 计算 · D3 展示`;
    $('cleaning').textContent=`采用无向简单图。${m.source_records} 条原始记录，合并 ${m.duplicates_removed} 条重复记录，保留 ${m.unique_relations} 条不同关系，计算图包含 ${m.edge_count} 条连接。`;
    const prior=$('type').value;$('type').replaceChildren(new Option('全部类型',''));[...new Set(data.nodes.map(n=>n.type))].sort().forEach(t=>$('type').add(new Option(`${types[t]||t} (${data.nodes.filter(n=>n.type===t).length})`,t)));$('type').value=prior;
    $('weights').replaceChildren();Object.entries(data.strengths).forEach(([r,w])=>{const row=document.createElement('tr');row.append(text('td',r),text('td',String(w)));$('weights').append(row)});
    view.setData(data);render();$('graph-message').hidden=true;
    ['download','zoom-in','zoom-out','fit','pause'].forEach(id=>$(id).disabled=false);
  }catch(error){
    $('notice').className='notice error';$('notice').replaceChildren(text('span',`${error.name==='AbortError'?'请求超时，请重试。':error.message} ${data?'正在显示上一次成功的结果。':'请确认 Python 服务已启动。'}`));const retry=text('button','重试');retry.onclick=load;$('notice').append(retry);
    if(!data){$('graph-message').replaceChildren(text('p','网络暂时无法加载，请点击上方“重试”。'));$('summary').textContent='加载失败'}
  }finally{clearTimeout(timeout);$('reload').disabled=false;$('reload').textContent='重新计算'}
}
document.querySelectorAll('[data-metric]').forEach(button=>button.onclick=()=>{metric=button.dataset.metric;render()});
document.querySelectorAll('[data-scale]').forEach(button=>button.onclick=()=>{scaleModes[metric]=button.dataset.scale;render()});
$('search').oninput=()=>{selected=null;render()};$('type').onchange=()=>{selected=null;render()};$('clear').onclick=()=>choose(null);$('reload').onclick=load;
$('zoom-in').onclick=()=>view.zoomBy(1.25);$('zoom-out').onclick=()=>view.zoomBy(.8);$('fit').onclick=()=>view.fit();
$('pause').onclick=()=>{$('pause').textContent=view.togglePause()?'继续布局':'暂停布局';$('pause').setAttribute('aria-pressed',String(view.paused))};
$('download').onclick=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='case2-centrality.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
load();

const $=id=>document.getElementById(id), make=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
const state={catalog:null,section:'overview',choices:{},generation:0,returnToOverview:false};
const pageNames={overview:'Overview',monitoring_station:'Monitoring stations',water_quality_record:'Water-quality records',sql_components:'SQL Components'};
const pretty=k=>k.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const colName=k=>({do_min:'DO min',do_max:'DO max',bod_min:'BOD min',bod_max:'BOD max',ph_min:'pH min',ph_max:'pH max',fc_min:'FC min',fc_max:'FC max'}[k]||pretty(k));
function btn(text,fn,cls='small-button'){const b=make('button',text);b.type='button';b.className=cls;b.onclick=fn;return b}
async function request(path,method='GET',body){const r=await fetch('/db/'+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
function formatParamValue(value){if(value===null)return 'NULL';let text;try{text=typeof value==='string'?JSON.stringify(value):JSON.stringify(value)}catch{const keys=typeof value==='object'?Object.keys(value).slice(0,6):[];text=keys.length?'{ '+keys.join(', ')+' }':'[unavailable value]'}if(text===undefined)text=String(value);return text.length>220?text.slice(0,217)+'…':text}
function paramsText(p){if(p==null||p.length===0)return 'No bound parameters';const values=Array.isArray(p)?p:Object.entries(p).map(([key,value])=>key+': '+formatParamValue(value));const visible=values.slice(0,8).map((value,i)=>Array.isArray(p)?(i+1)+': '+formatParamValue(value):value);if(values.length>visible.length)visible.push('… '+(values.length-visible.length)+' more parameters');return visible.join('\n')}
function formatSql(sql){return String(sql||'').replace(/\s+/g,' ').trim().replace(/\s+(FROM|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|WHERE|GROUP BY|ORDER BY|SET|VALUES|CALL)\s+/gi,'\n$1 ').replace(/\s+(AND|OR)\s+/gi,'\n  $1 ')}
function notice(text,kind=''){const n=$('notice');n.textContent=text;n.className='notice '+kind}
async function activity(){try{const list=await request('activity'),host=$('activity');host.replaceChildren();if(!list.length){const e=make('div','No SQL statements recorded in this session.');e.className='empty';host.append(e);return}list.slice(0,30).forEach(a=>{const row=make('div');row.className='activity-entry';const query=make('pre',formatSql(a.sql));query.className='activity-query';row.append(query);row.onclick=()=>row.classList.toggle('open');host.append(row)})}catch{}}
function addField(parent,name,input,required=true){const l=make('label');l.append(make('span',colName(name)+(required?' *':'')),input);parent.append(l);return input}
function choices(items,placeholder='Select…'){const s=make('select');s.append(new Option(placeholder,''));(items||[]).forEach(x=>s.append(new Option(x.name?x.id+' · '+x.name:String(x.id),x.id)));return s}
function buildExplorer() {
  const host = $('explorer');
  const addItem = name => {
    const item = btn(pageNames[name] || pretty(name), () => openSection(name), 'tree-item');
    item.dataset.key = name;
    return item;
  };
  const tables = make('section');
  tables.className = 'tree-group';
  const heading = make('h3', 'Tables');
  heading.className = 'tree-group-title';
  tables.append(heading, ...state.catalog.objects.tables.map(addItem));
  host.replaceChildren(addItem('overview'), tables, addItem('sql_components'));
}
function setActive(name) {
  document.querySelectorAll('[data-key]').forEach(item => {
    const active = item.dataset.key === name;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}
async function loadChoices(entity){const refs=new Set((state.catalog.fields[entity]||[]).map(k=>state.catalog.references[k]).filter(Boolean));if(entity==='water_quality_record')refs.add('river');state.choices=Object.fromEntries(await Promise.all([...refs].map(async r=>[r,await request(r)])))}
async function openSection(name,success=''){const version=++state.generation;state.section=name;setActive(name);$('heading').textContent=pageNames[name]||pretty(name);$('controls').replaceChildren();$('results').replaceChildren();notice('Loading…');if(name==='overview'){await dashboard(version);return}if(name==='sql_components'){componentsPage();return}if(state.catalog.fields[name]){await loadChoices(name);controls(name,version);await rows(name,version,success);return}notice('No database page is registered for '+pretty(name),'error')}
function controls(name,version){const c=$('controls');if(name==='monitoring_station'){const q=make('input');q.placeholder='station name or ID';addField(c,'Search',q,false);c.append(btn('Search',()=>rows(name,version,'','q='+encodeURIComponent(q.value)),'primary'))}if(name==='water_quality_record'){const q=make('input'),y=make('input'),r=choices(state.choices.river,'all rivers');q.placeholder='station or river';y.type='number';y.placeholder='all years';addField(c,'Search',q,false);addField(c,'Year',y,false);addField(c,'River',r,false);c.append(btn('Apply filters',()=>rows(name,version,'','q='+encodeURIComponent(q.value)+'&year='+encodeURIComponent(y.value)+'&river='+encodeURIComponent(r.value)),'primary'))}if(name!=='river_segment')c.append(btn('＋ New '+pretty(name).toLowerCase(),()=>edit(null),'primary'))}
async function rows(entity,version,success='',query=''){try{const data=await request(entity+(query?'?'+query:''));if(version!==state.generation)return;const emptyMessage=query?'No matching rows.':'No records have been added to this table yet.';notice(success,success?'success':'');renderTable($('results'),data,entity,true,emptyMessage)}catch(e){if(version===state.generation)notice(e.message,'error')}await activity()}
const measurementColumns = new Set([
  'do_min', 'do_max', 'bod_min', 'bod_max', 'ph_min', 'ph_max',
  'fc_min', 'fc_max', 'longitude', 'latitude', 'length_km', 'level_m'
]);
function renderTable(host, data, entity, editable, emptyMessage = 'No records have been added to this table yet.') {
  const panel = make('section');
  panel.className = 'grid-panel';
  const heading = make('div');
  heading.className = 'panel-heading';
  heading.append(make('h2', entity === 'overview' ? 'Station readings' : 'Result grid'));
  panel.append(heading);
  if (!data.length) {
    panel.classList.add('empty-grid');
    const empty = make('div', emptyMessage);
    empty.className = 'empty';
    panel.append(empty);
    host.append(panel);
    return;
  }

  const wrap = make('div');
  wrap.className = 'data-wrap';
  const table = make('table');
  table.className = 'data-grid';
  const columns = Object.keys(data[0]).filter(key => key !== 'edit_history');
  const header = table.createTHead().insertRow();
  for (const key of columns) {
    const cell = make('th', colName(key));
    cell.scope = 'col';
    if (measurementColumns.has(key)) cell.classList.add('measurement');
    header.append(cell);
  }
  const canEdit = editable && state.catalog.fields[entity] && entity !== 'river_segment';
  if (canEdit) header.append(make('th', 'Actions'));

  const body = table.createTBody();
  for (const row of data) {
    const tr = body.insertRow();
    for (const key of columns) {
      const cell = tr.insertCell();
      const value = row[key];
      const measurement = measurementColumns.has(key);
      if (measurement) cell.classList.add('measurement');
      const references = state.choices[state.catalog.references[key]];
      const ref = references?.find(item => String(item.id) === String(value));

      if (value == null) {
        cell.textContent = '—';
        cell.classList.add('null');
      } else if (ref) {
        cell.append(make('code', String(ref.id)), ' · ' + (ref.name || ''));
      } else if (measurement && entity === 'overview') {
        cell.textContent = Number(value).toFixed(2);
      } else {
        cell.textContent = String(value);
        if (key === 'id' || key.endsWith('_id')) cell.classList.add('identifier');
      }
    }
    if (canEdit) {
      const actions = tr.insertCell();
      actions.className = 'actions';
      actions.append(btn('Edit', () => edit(row)), btn('Delete', () => remove(row), 'small-button danger'));
      if (entity === 'monitoring_station') actions.append(btn('Profile', () => profile(row.id, row.name)));
      if (entity === 'water_quality_record') actions.append(btn('History', () => history(row)));
    }
  }
  wrap.append(table);
  panel.append(wrap);
  host.append(panel);
}
function componentsPage(){const host=$('results'),types=[['procedure','Stored Procedures'],['function','Functions'],['trigger','Triggers'],['cursor','Cursors'],['view','Views']];host.replaceChildren();types.forEach(([type,title])=>{const items=(state.catalog.components||[]).filter(x=>x.type===type),section=make('section');section.className='component-section';const heading=make('div');heading.className='component-section-heading';heading.append(make('h2',title));section.append(heading);if(!items.length){const empty=make('p','No definitions found in the project SQL files.');empty.className='empty';section.append(empty)}items.forEach(component=>{const row=make('article');row.className='component-row';const summary=make('div');summary.className='component-summary';const name=make('strong',component.name);name.className='component-name';summary.append(name);const sql=make('pre',component.sql||'Definition unavailable in the project SQL files.');sql.className='component-sql';sql.hidden=true;const toggle=btn('View SQL',()=>{sql.hidden=!sql.hidden;toggle.textContent=sql.hidden?'View SQL':'Hide SQL'},'ghost');summary.append(toggle);row.append(summary,sql);section.append(row)});host.append(section)});notice('')}
function preview(entity,keys,values,row){const p=keys.map(k=>values[k]??null);return row?{sql:'update '+entity+' set '+keys.map(k=>k+'=?').join(', ')+' where id=?',params:[...p,row.id]}:{sql:'insert into '+entity+' ('+keys.join(', ')+') values ('+keys.map(()=>'?').join(', ')+')',params:p}}
function edit(row){const d=$('editor'),form=$('form'),box=$('inputs'),keys=state.catalog.fields[state.section].filter(k=>!(row&&k==='id'));box.replaceChildren();$('form_title').textContent=(row?'Edit ':'New ')+pretty(state.section);$('form_error').textContent='';keys.forEach(k=>{const input=state.catalog.references[k]?choices(state.choices[state.catalog.references[k]]):make('input');if(k==='measured_on')input.type='date';input.name=k;input.value=row?.[k]??'';input.required=!state.catalog.optional.includes(k);input.oninput=update;addField(box,k,input,input.required)});function update(){const x=preview(state.section,keys,Object.fromEntries(new FormData(form)),row);$('form_sql').textContent=x.sql;$('form_params').textContent='Parameters\n'+paramsText(x.params)}form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(form)),submit=form.querySelector('.primary');submit.disabled=true;try{await request(state.section+(row?'/'+encodeURIComponent(row.id):''),row?'PUT':'POST',values);d.close();const destination=state.returnToOverview?'overview':state.section;state.returnToOverview=false;await openSection(destination,'Operation completed')}catch(err){$('form_error').textContent=err.message}finally{submit.disabled=false}};d.showModal();update()}
async function remove(row){if(!confirm('Delete '+(row.name||row.id)+'? This executes a parameterized DELETE.'))return;try{await request(state.section+'/'+encodeURIComponent(row.id),'DELETE');await openSection(state.section,'Record deleted')}catch(e){notice(e.message,'error')}await activity()}
function history(row){const d=document.createElement('dialog'),f=make('form');f.append(make('h2','Edit history'),make('pre',JSON.stringify(row.edit_history||[],null,2)),btn('Close',()=>d.close(),'ghost'));d.append(f);document.body.append(d);d.showModal();d.onclose=()=>d.remove()}
async function profile(id,name){const d=document.createElement('dialog'),f=make('form');f.append(make('h2',name+' · '+id));const data=await request('water_quality_record?station='+encodeURIComponent(id));renderTable(f,data,'water_quality_record',false);f.append(btn('Close',()=>d.close(),'ghost'));d.append(f);document.body.append(d);d.showModal();d.onclose=()=>d.remove();await activity()}
async function dashboard(version){const c=$('controls'),year=make('select'),river=make('select'),years=await request('years'),rivers=await request('river');years.forEach(x=>year.append(new Option(String(x.report_year),x.report_year)));river.append(new Option('All rivers',''));rivers.forEach(x=>river.append(new Option(x.name,x.id)));year.value=years[0]?.report_year||'';addField(c,'Reporting year',year,false);addField(c,'River',river,false);const refresh=async()=>{const query=new URLSearchParams({river:river.value,year:year.value}),[data,counts]=await Promise.all([request('dashboard?'+query),request('dashboard_stats?'+query)]);if(version!==state.generation)return;const stats=make('div');stats.className='stat-grid';[['Monitoring stations',counts.total_stations||0],['Reported',counts.reported_stations||0],['Flagged readings',counts.flagged_stations||0],['Missing records',counts.missing_stations||0]].forEach(([label,value])=>{const card=make('article');card.className='stat-card';card.append(make('h2',label),make('strong',String(value)));stats.append(card)});const gridRows=data.map(x=>({station:x.station_name,river:x.river_name,do_min:x.do_min,bod_max:x.bod_max,status:x.status}));const results=$('results');results.replaceChildren(stats);renderTable(results,gridRows,'overview',false);notice('');await activity()};year.onchange=refresh;river.onchange=refresh;await refresh()}
$('cancel').onclick=$('cancel_bottom').onclick=()=>$('editor').close();$('add_record').onclick=async()=>{state.section='water_quality_record';state.returnToOverview=true;await loadChoices('water_quality_record');edit(null)};
request('catalog').then(c=>{state.catalog=c;buildExplorer();openSection('overview')}).catch(e=>notice(e.message,'error'));activity();

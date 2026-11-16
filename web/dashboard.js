const page_names = {
  overview: 'Water quality overview',
  monitoring_station: 'Monitoring stations',
  water_quality_record: 'Water-quality records',
  reports: 'Reports'
};
function metric(value) {
  return value == null ? '—' : String(Number(value));
}
function status_badge(status) {
  const badge = node('span',status);
  badge.className = 'badge ' + status.toLowerCase().replaceAll(' ','_');
  return badge;
}
function make_table(headings) {
  const table = node('table');
  const row = table.createTHead().insertRow();
  for (const name of headings) row.append(node('th',name));
  table.createTBody();
  return table;
}
async function station_profile(id,name) {
  const dialog = node('dialog');
  dialog.append(node('h2',name),node('p','Station '+id));
  const content = node('div','Loading annual history…');
  dialog.append(content,button('Close',() => dialog.close()));
  document.body.append(dialog);
  dialog.onclose = () => dialog.remove();
  dialog.showModal();
  try {
    const [history,gaps] = await Promise.all([
      request('water_quality_record?station='+encodeURIComponent(id)),
      request('station_gaps/'+encodeURIComponent(id))
    ]);
    content.replaceChildren();
    const table = make_table(['Year','Min DO (mg/L)','Max BOD (mg/L)','pH range','Max FC (MPN/100 mL)','Status']);
    history.sort((a,b) => b.report_year-a.report_year);
    for (const row of history) {
      const line = table.tBodies[0].insertRow();
      for (const value of [row.report_year,metric(row.do_min),metric(row.bod_max),metric(row.ph_min)+' – '+metric(row.ph_max),metric(row.fc_max)]) line.insertCell().textContent = value;
      line.insertCell().append(status_badge(row.quality_status));
    }
    if (history.length) content.append(table);
    else content.append(node('p','No annual readings recorded.'));
    const missing = gaps[0].gaps_between_records;
    const ranges = typeof missing === 'string' ? JSON.parse(missing) : missing;
    if (history.length > 1) content.append(node('p',ranges.length ? 'Missing years between records: '+ranges.map(row => row.first_missing+'–'+row.last_missing).join(', ') : 'No gaps between recorded years.'));
  } catch(error) { content.textContent = error.message; }
}
async function dashboard(version) {
  const [rivers,years] = await Promise.all([request('river'),request('years')]);
  if (generation !== version) return;
  const controls = el('controls');
  const river = field(controls,'River',node('select'));
  river.add(new Option('All rivers',''));
  for (const row of rivers) river.add(new Option(row.name,row.id));
  const year = field(controls,'Year',node('input'));
  year.type = 'number'; year.min = '1900'; year.max = '2100';
  year.value = years[0]?.report_year || new Date().getFullYear();
  let change = 0;
  async function refresh() {
    const current = ++change;
    el('results').replaceChildren();
    if (!year.value || !year.checkValidity()) {
      el('notice').textContent = 'Enter a year between 1900 and 2100.';
      return;
    }
    try {
      el('notice').textContent = 'Loading readings…';
      const stations = await request('dashboard?'+new URLSearchParams({river:river.value,year:year.value}));
      if (version !== generation || current !== change) return;
      el('notice').textContent = '';
      draw_overview(stations);
    } catch(error) { if (generation === version && current === change) el('notice').textContent = error.message; }
  }
  river.onchange = refresh; year.onchange = refresh;
  await refresh();
}
function draw_overview(stations) {
  const flagged = stations.filter(row => row.status === 'Flagged').length;
  const missing = stations.filter(row => row.status === 'Missing').length;
  const cards = node('div'); cards.className = 'cards';
  const metrics = [
    ['Monitoring stations',stations.length],['Reported',(stations.length-missing)+' of '+stations.length],
    ['Flagged stations',flagged],['Missing records',missing]
  ];
  for (const [title,value] of metrics) {
    const card = node('article'); card.append(node('small',title),node('strong',value)); cards.append(card);
  }
  const grid = node('div'); grid.className = 'grid';
  const panel = node('section'), attention = node('section');
  attention.append(node('h2','Needs attention'));
  const heading = node('h2'), list = node('div'); list.className = 'scroll';
  panel.append(heading,list);
  function show(status) {
    const selected = status ? stations.filter(row => row.status === status) : stations;
    heading.textContent = status ? status+' stations' : 'Station readings';
    list.replaceChildren();
    if (status) list.append(button('Show all stations',() => show('')));
    const table = make_table(['Station','Min DO (mg/L)','Max BOD (mg/L)','Status']);
    for (const row of selected) {
      const line = table.tBodies[0].insertRow();
      const link = button(row.station_name,() => station_profile(row.station_id,row.station_name));
      link.className = 'station';
      line.insertCell().append(link,node('small',row.river_name));
      line.insertCell().textContent = metric(row.do_min);
      line.insertCell().textContent = metric(row.bod_max);
      line.insertCell().append(status_badge(row.status));
    }
    list.append(selected.length ? table : node('p','No matching stations.'));
  }
  for (const [count,title,status,action] of [[flagged,'flagged for review','Flagged','Review readings'],[missing,'without annual records','Missing','View stations']]) {
    const block = node('div'); block.className = 'attention';
    block.append(node('strong',count+' '+title));
    if (count) block.append(button(action,() => show(status)));
    attention.append(block);
  }
  show(''); grid.append(panel,attention); el('results').replaceChildren(cards,grid);
}

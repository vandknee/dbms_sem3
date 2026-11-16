const fs = require('node:fs');
const { pool, transaction, logQuery, getActivity } = require('./connection');
const { fields, references, optional, validate } = require('./entities');
const reports = new Map();
for (const section of fs.readFileSync(__dirname + '/reports.sql','utf8').split(/^-- /m).slice(1)) {
  const end = section.indexOf('\n');
  reports.set(section.slice(0,end).trim(), section.slice(end).trim());
}
const componentDescriptions = {
  check_parent: 'Checks a proposed tributary relationship for a cycle before it is stored.',
  river_summary: 'Returns station and annual-record counts grouped by river.',
  flagged_stations: 'Returns readings classified as flagged for a selected reporting year.',
  missing_records: 'Returns monitoring stations without a quality record for a selected year.',
  year_comparison: 'Compares selected-year readings with the previous year for each station.',
  observation_gaps: 'Uses a cursor to find missing years in a station history.',
  status_changes: 'Uses a cursor to find consecutive-year quality-status changes.',
  flag_streak: 'Uses a cursor to calculate the longest consecutive flagged-reading streak.',
  reading_status: 'Classifies a reading using the thresholds implemented in the project.',
  quality_details: 'Joins quality records to station and river names and computes quality status.',
  save_previous_reading: 'Stores the previous water-quality values in edit history before an update.',
  validate_parent_insert: 'Checks a new tributary relationship before insertion.',
  validate_parent_update: 'Checks an edited tributary relationship before update.',
  require_observation_evidence: 'Rejects pollution observations without evidence and observation text.',
  require_updated_evidence: 'Applies the same evidence requirement to pollution-record updates.'
};
function readComponents() {
  const read = name => fs.readFileSync(__dirname + '/' + name,'utf8');
  const components = [];
  const addProcedures = source => {
    for (const match of source.matchAll(/create procedure if not exists\s+([a-z0-9_]+)[\s\S]*?end\/\/?/gi)) {
      const name = match[1];
      components.push({name,type:'procedure',description:componentDescriptions[name] || 'Stored procedure defined in the project SQL.',sql:match[0].trim()});
    }
  };
  addProcedures(read('procedures.sql'));
  addProcedures(read('cursors.sql'));
  const functionMatch = read('functions.sql').match(/create function if not exists\s+([a-z0-9_]+)[\s\S]*?end;/i);
  if (functionMatch) components.push({name:functionMatch[1],type:'function',description:componentDescriptions[functionMatch[1]],sql:functionMatch[0].trim()});
  const viewMatch = read('functions.sql').match(/create or replace view\s+([a-z0-9_]+)[\s\S]*?;/i);
  if (viewMatch) components.push({name:viewMatch[1],type:'view',description:componentDescriptions[viewMatch[1]],sql:viewMatch[0].trim()});
  const triggerSource = read('triggers.sql');
  const triggerStarts = [...triggerSource.matchAll(/create trigger if not exists\s+([a-z0-9_]+)\s+(before|after)\s+(insert|update|delete)\s+on\s+([a-z0-9_]+)/gi)];
  triggerStarts.forEach((match,index) => {
    const raw = triggerSource.slice(match.index,triggerStarts[index+1]?.index ?? triggerSource.length).replace(/^delimiter\s+.*$/gim,'').trim();
    components.push({name:match[1],type:'trigger',event:match[2].toUpperCase()+' '+match[3].toUpperCase(),table:match[4],description:componentDescriptions[match[1]],sql:raw});
  });
  const cursorSource = read('cursors.sql');
  for (const procedure of cursorSource.matchAll(/create procedure if not exists\s+([a-z0-9_]+)[\s\S]*?end\/\/?/gi)) {
    for (const cursor of procedure[0].matchAll(/declare\s+([a-z0-9_]+)\s+cursor\s+for\s+([\s\S]*?);/gi)) {
      components.push({name:cursor[1],type:'cursor',procedure:procedure[1],iterates:cursor[2].trim(),description:'Cursor declared inside '+procedure[1]+' and iterating over its station history query.',sql:cursor[0].trim()});
    }
  }
  return components;
}
function problem(status, message) {
  return Object.assign(new Error(message), {status});
}
async function read_body(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 24000) throw problem(413,'Form is too large.');
  }
  try { return JSON.parse(body); } catch { throw problem(400,'Send a JSON form.'); }
}
async function workspace(req, url) {
  const [, ,entity,id,extra] = url.pathname.split('/');
  const query = url.searchParams;
  if (extra || !entity) throw problem(404,'Unknown database page.');
  if (req.method === 'GET') {
    if (entity === 'activity') return getActivity();
    if (entity === 'catalog') return {
      fields,references,optional,components:readComponents(),
      database: 'rivertrace_monitor',
      objects: {
        tables: Object.keys(fields),
        views: ['quality_details'],
        procedures: ['check_parent','river_summary','flagged_stations','missing_records','year_comparison','observation_gaps','status_changes','flag_streak'],
        functions: ['reading_status'],
        triggers: ['save_previous_reading','validate_parent_insert','validate_parent_update','require_observation_evidence','require_updated_evidence'],
        concepts: ['Primary & foreign keys','Joins and aggregation','Stored procedures','Functions','Triggers','Cursors','Views','Transactions','Constraints','Normalization']
      }
    };
    if (entity === 'years') {
      const sql = 'select distinct report_year from water_quality_record order by report_year desc';
      const started = Date.now();
      try { const result = (await pool.query(sql))[0]; logQuery({sql,params:[],operation:'SELECT',status:'SUCCESS',rows:result.length,duration:Date.now()-started}); return result; }
      catch (error) { logQuery({sql,params:[],operation:'SELECT',status:'ERROR',error:error.message,duration:Date.now()-started}); throw error; }
    }
    if (entity === 'dashboard_stats') {
      const rowsSql = fs.readFileSync(__dirname + '/dashboard.sql','utf8');
      const statsSql = `select count(*) as total_stations
from monitoring_station s
join river r on r.id = s.river_id
where ? = '' or r.id = ?`;
      const river = query.get('river') || '';
      const yearParams = [query.get('year'),river,river];
      const [rows] = await executeLogged(pool,rowsSql,yearParams,'SELECT');
      const [stats] = await executeLogged(pool,statsSql,[river,river],'SELECT');
      return {
        total_stations: stats[0]?.total_stations || 0,
        reported_stations: rows.filter(row => row.status !== 'Missing').length,
        missing_stations: rows.filter(row => row.status === 'Missing').length,
        flagged_stations: rows.filter(row => row.status === 'Flagged').length
      };
    }
    if (entity === 'dashboard') {
      const sql = fs.readFileSync(__dirname + '/dashboard.sql','utf8');
      const river = query.get('river') || '';
      const params = [query.get('year'),river,river];
      const [rows] = await executeLogged(pool,sql,params,'SELECT');
      return rows;
    }
    if (entity === 'station_gaps') {
      return (await executeLogged(pool,'call observation_gaps(?)',[id],'CALL'))[0];
    }
    if (entity === 'report' && reports.has(id)) {
      const sql = reports.get(id);
      const [result_sets] = await executeLogged(pool,sql,sql.includes('?') ? [query.get('year')] : [],'CALL');
      return result_sets[0];
    }
  }
  if (!Object.hasOwn(fields,entity)) throw problem(404,'Unknown table.');
  if (req.method === 'GET') {
    const values = [], conditions = [];
    let sql = 'select * from ' + entity;
    if (entity === 'river_segment') sql = 'select id,next_id,longitude,latitude,length_km from river_segment';
    if (entity === 'water_quality_record') {
      sql = 'select * from quality_details';
      for (const [key,column] of [['year','report_year'],['river','river_id']]) {
        if (query.get(key)) { conditions.push(column + ' = ?'); values.push(query.get(key)); }
      }
      if (query.get('q')) {
        conditions.push('(station_name like ? or station_id like ? or river_name like ?)');
        values.push(...Array(3).fill('%' + query.get('q') + '%'));
      }
    }
    if (entity === 'water_quality_record' && query.get('station')) {
      conditions.push('station_id = ?');
      values.push(query.get('station'));
    }
    if (entity === 'monitoring_station' && query.get('q')) {
      conditions.push('(name like ? or id like ?)');
      values.push('%' + query.get('q') + '%', '%' + query.get('q') + '%');
    }
    if (id) { conditions.push('id = ?'); values.push(decodeURIComponent(id)); }
    if (conditions.length) sql += ' where ' + conditions.join(' and ');
    return (await executeLogged(pool,sql + ' order by id',values,'SELECT'))[0];
  }
  if (entity === 'river_segment' || !['POST','PUT','DELETE'].includes(req.method)) throw problem(405,'Operation unavailable.');
  if ((req.method === 'POST') === Boolean(id)) throw problem(400,'Check the record ID.');
  let values;
  if (req.method !== 'DELETE') {
    const body = await read_body(req);
    try { values = validate(entity,body,Boolean(id)); } catch (error) { throw problem(400,error.message); }
  }
  return transaction(async db => {
    // Serialize hierarchy edits before the cycle triggers read the parent chain.
    if (entity === 'tributary') await executeLogged(db,'select id from river order by id for update',[],'SELECT');
    const key = id && decodeURIComponent(id);
    if (id) {
      const [rows] = await executeLogged(db,'select id from ' + entity + ' where id=? for update',[key],'SELECT');
      if (!rows.length) throw problem(404,'Record no longer exists.');
    }
    if (req.method === 'DELETE') {
      if (entity === 'water_quality_record') await executeLogged(db,'delete from pollution_record where record_id=?',[key],'DELETE');
      await executeLogged(db,'delete from ' + entity + ' where id=?',[key],'DELETE');
      return {deleted:true};
    }
    const columns = Object.keys(values);
    if (id) {
      await executeLogged(db,'update ' + entity + ' set ' + columns.map(k => k+'=?').join(',') + ' where id=?',[...Object.values(values),key],'UPDATE');
      return {updated:true};
    }
    const [result] = await executeLogged(db,'insert into ' + entity + ' (' + columns.join(',') + ') values (' + columns.map(() => '?').join(',') + ')',Object.values(values),'INSERT');
    return {id:values.id || result.insertId};
  });
}
async function executeLogged(connection, sql, params, operation) {
  const started = Date.now();
  try {
    const result = await connection.execute(sql, params);
    const rows = Array.isArray(result[0]) ? result[0].length : result[0].affectedRows;
    logQuery({sql,params,operation,status:'SUCCESS',rows,duration:Date.now()-started});
    return result;
  } catch (error) {
    logQuery({sql,params,operation,status:'ERROR',error:error.message,duration:Date.now()-started});
    throw error;
  }
}
module.exports = workspace;

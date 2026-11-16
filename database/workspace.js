const fs = require('node:fs');
const { pool, transaction, logQuery, getActivity } = require('./connection');
const { fields, references, optional, validate } = require('./entities');
const reports = new Map();
for (const section of fs.readFileSync(__dirname + '/reports.sql','utf8').split(/^-- /m).slice(1)) {
  const end = section.indexOf('\n');
  reports.set(section.slice(0,end).trim(), section.slice(end).trim());
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
      fields,references,optional,reports:[...reports.keys()],
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
    if (entity === 'dashboard') {
      const sql = fs.readFileSync(__dirname + '/dashboard.sql','utf8');
      const river = query.get('river') || '';
      return executeLogged(pool,sql,[query.get('year'),river,river],'SELECT');
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
    const rows = Array.isArray(result[0]) ? result[0] : result[0].affectedRows;
    logQuery({sql,params,operation,status:'SUCCESS',rows,duration:Date.now()-started});
    return result;
  } catch (error) {
    logQuery({sql,params,operation,status:'ERROR',error:error.message,duration:Date.now()-started});
    throw error;
  }
}
module.exports = workspace;

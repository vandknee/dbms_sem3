select s.id as station_id, s.name as station_name, r.name as river_name,
       q.do_min, q.bod_max, q.ph_min, q.ph_max, q.fc_max,
       coalesce(q.quality_status, 'Missing') as status
from monitoring_station s
join river r on r.id = s.river_id
left join quality_details q on q.station_id = s.id and q.report_year = ?
where ? = '' or r.id = ?
order by r.name, s.name

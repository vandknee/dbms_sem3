create function if not exists reading_status(
  oxygen decimal(14,4), bod decimal(14,4), low_ph decimal(14,4),
  high_ph decimal(14,4), bacteria decimal(14,4)
) returns varchar(20) deterministic no sql
return case
  when oxygen <= 5 or bod >= 3 or low_ph < 6.5 or high_ph > 8.5 or bacteria >= 2500 then 'Flagged'
  when oxygen is null or bod is null or low_ph is null or high_ph is null or bacteria is null then 'Incomplete'
  else 'Within limits'
end;

create or replace view quality_details as
select q.*, s.name as station_name, r.id as river_id, r.name as river_name,
  reading_status(do_min, bod_max, ph_min, ph_max, fc_max) as quality_status
from water_quality_record q
join monitoring_station s on s.id = q.station_id
join river r on r.id = s.river_id;


# RiverTrace
A local water-quality workspace for the Ganga basin. Use the overview to select a river and year. Select a station name for its annual history. Reports cover river totals, flagged readings, missing reports and year comparisons.

## Windows setup for an existing rivertrace_v2 database
Use MySQL 8.4 and Node.js 22.9 or later. Extract the ZIP, open the inner rivertrace folder in VS Code and start a PowerShell terminal there. Copy your working .env into this folder and check its DB_NAME. Install the new function and update the reporting view before starting the site.

1. In PowerShell, run the following to print the four MySQL commands with your own paths.

~~~powershell
$db_folder = (Resolve-Path database).Path.Replace('\','/')
'functions.sql','procedures.sql','cursors.sql','triggers.sql' | ForEach-Object { "source $db_folder/$_" }
~~~

2. In MySQL Command Line Client as administrator, enter the following, then paste the four printed commands one by one.

~~~sql
use rivertrace_v2;
~~~

3. In VS Code, start the app.

~~~powershell
npm.cmd ci
$env:PORT = "8081"
npm.cmd start
~~~

Open http://127.0.0.1:8081. Stop an earlier server on that port using Ctrl+C in its terminal. The existing installation already contains its tables and seed data.

## First-time setup for teammates
1. Start MySQL Server. In the MySQL Command Line Client as administrator, create a fresh database and local application account. Replace the password placeholder.

~~~sql
create database rivertrace_monitor character set utf8mb4;
create user 'river_monitor'@'localhost' identified by 'choose_your_password';
grant select, insert, update, delete, execute on rivertrace_monitor.* to 'river_monitor'@'localhost';
use rivertrace_monitor;
~~~

2. From the extracted project folder in VS Code, print the setup commands.

~~~powershell
$db_folder = (Resolve-Path database).Path.Replace('\','/')
'schema.sql','functions.sql','procedures.sql','cursors.sql','triggers.sql' | ForEach-Object { "source $db_folder/$_" }
~~~

3. Paste those commands into the MySQL client in order. Stop on an error. An administrator with privileges to create routines and triggers should run them.
4. In PowerShell run the following.

~~~powershell
npm.cmd ci
Copy-Item .env.example .env
~~~

5. Open .env. Set DB_NAME to rivertrace_monitor, DB_USER to river_monitor, and DB_PASSWORD to the password chosen above. Keep this file private.
6. Seed once, then start the website.

~~~powershell
npm.cmd run seed
$env:PORT = "8081"
npm.cmd start
~~~

After setup, start MySQL and run the last two PowerShell lines whenever you want to open the site.

## Where the database does the work
| Website action | SQL implementation |
| --- | --- |
| Filter the overview | dashboard.sql uses a left join so stations with no record for the chosen year remain visible. |
| Open a station | Annual history uses station_id. The observation_gaps cursor scans consecutive reporting years to identify gaps inside the recorded period. |
| Read a status | functions.sql defines reading_status and the quality_details view. An exceeded limit takes priority over missing values. A missing annual row is labelled Missing in the dashboard. |
| Run a report | reports.sql calls procedures in procedures.sql. River totals use joins and grouping. Missing annual records use a correlated not exists query. Year comparison joins two years for the same station. |
| Correct a reading | triggers.sql saves the previous readings, notes and source in edit_history before the update. Open History on the records page. Deleting a record also deletes its history and linked observations. |
| Manage tributaries and observations | Triggers reject a tributary cycle and require evidence for an observation. Foreign keys check related IDs. |
| Add or edit data | workspace.js binds form values and wraps related writes in a transaction. schema.sql enforces valid reading pairs and a unique station/year. |

queries.sql contains standalone read-only queries. cursors.sql also includes status_changes and flag_streak for station-level analysis.

## Normalisation example
Start with a register holding station details and several years of readings on each line. For 1NF, use one station/year per observation and a separate scalar column for each annual minimum and maximum. For 2NF, separate station details that depend on station_id alone from measurements that depend on the full station/year key. For 3NF, store the river name and basin relationship in river, with monitoring_station referencing river_id. Editing a river name in one place updates its display through the joins. The annual table has a surrogate id and a unique constraint on its natural station/year key. Its JSON revision history is a deliberate exception to storing each historical value in a separate relational row.

## Data
The seed contains 7 rivers, 18 stations and 31 historical annual records for 2022–2023. See data/README.md for provenance, units and qualifications. An annual minimum and maximum can come from different sample dates. The status reflects the project's review thresholds. Water levels and pollution observations start empty.

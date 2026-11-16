# RiverTrace

RiverTrace is a web-based river water-quality monitoring and database management system for the Ganga basin. It allows users to explore monitoring stations, view historical water-quality records, analyze pollution levels, and generate reports.

## Requirements

Before running the project, install:

- Node.js (version 22.9 or later)
- MySQL Server 8.4
- MySQL Command Line Client
- VS Code (recommended)

## How to Run the Project

### Step 1: Download the Project

Clone the repository:

```powershell
git clone https://github.com/vandknee/dbms_sem3.git
cd dbms_sem3
```

Open the project folder in VS Code.

### Step 2: Set Up MySQL

Open MySQL Command Line Client and log in as an administrator.

Run the following commands:

```sql
CREATE DATABASE rivertrace_monitor CHARACTER SET utf8mb4;

CREATE USER 'river_monitor'@'localhost'
IDENTIFIED BY 'your_password';

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE
ON rivertrace_monitor.*
TO 'river_monitor'@'localhost';

USE rivertrace_monitor;
```

Replace `your_password` with your preferred password.

### Step 3: Import the Database Files

Open a PowerShell terminal in the project's root folder and run:

```powershell
$db_folder = (Resolve-Path database).Path.Replace('\','/')
'schema.sql','functions.sql','procedures.sql','cursors.sql','triggers.sql' | ForEach-Object { "source $db_folder/$_" }
```

Copy the five generated `source` commands into MySQL Command Line Client and execute them in order.

### Step 4: Install Dependencies

In the VS Code terminal, run:

```powershell
npm.cmd ci
```

### Step 5: Configure the Database Connection

Create a file named `.env` in the project's root folder.

Add the following:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=rivertrace_monitor
DB_USER=river_monitor
DB_PASSWORD=your_password
```

Use the same password you created in Step 2.

Do not upload `.env` to GitHub.

### Step 6: Insert Sample Data

Run:

```powershell
npm.cmd run seed
```

This populates the database with sample river, station, and water-quality records.

Run this step only during the initial setup.

### Step 7: Start the Website

Run:

```powershell
$env:PORT = "8081"
npm.cmd start
```

Open the following URL in your browser:

http://127.0.0.1:8081

The RiverTrace website should now be running.

## Running the Project Again

After completing the initial setup, you do not need to recreate the database, reinstall dependencies, or seed the data every time.

Simply start MySQL Server, open the project in VS Code, and run:

```powershell
$env:PORT = "8081"
npm.cmd start
```

Visit http://127.0.0.1:8081.

Press `Ctrl + C` in the terminal to stop the server.

## Project Structure

| Folder/File | Purpose |
|---|---|
| `server.js` | Node.js application server |
| `database/` | SQL schema, queries, procedures, triggers, and database connection |
| `data/` | River network and water-quality datasets |
| `web/` | Frontend HTML, CSS, and JavaScript |
| `package.json` | Project dependencies and scripts |

## Database Features

The project demonstrates several DBMS concepts:

- Relational tables and normalization
- Primary and foreign keys
- SQL joins and aggregate queries
- Stored procedures and functions
- Triggers for validation and history tracking
- Cursors for analyzing monitoring records
- Transactions for database operations
- Historical water-quality reporting

## Sample Dataset

The database includes 7 rivers, 18 monitoring stations, and 31 historical annual water-quality records from 2022 and 2023.

Additional information about data sources is available in `data/README.md`.
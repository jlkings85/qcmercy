CREATE TABLE IF NOT EXISTS qc_education_documents (
 id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,version TEXT NOT NULL,
 filename TEXT NOT NULL,mime TEXT NOT NULL,storage_key TEXT NOT NULL,sha256 TEXT NOT NULL,
 required INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qc_education_assignments (
 id TEXT PRIMARY KEY,operator_id TEXT NOT NULL,series_id TEXT NOT NULL,record_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','assigned','cancelled','completed')),
 created_at TEXT NOT NULL,due_at TEXT NOT NULL,assigned_at TEXT,completed_at TEXT,reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qc_education_operator ON qc_education_assignments(operator_id,state,due_at);
CREATE TABLE IF NOT EXISTS qc_education_items (
 assignment_id TEXT NOT NULL,document_id TEXT NOT NULL,opened_at TEXT,acknowledged_at TEXT,
 PRIMARY KEY(assignment_id,document_id)
);
CREATE TRIGGER IF NOT EXISTS qc_education_guard BEFORE INSERT ON records
WHEN NEW.status IN ('pass','exception') AND COALESCE(json_extract(NEW.snapshot,'$.historical'),0)=0
AND EXISTS(SELECT 1 FROM qc_education_assignments WHERE operator_id=NEW.operator_id
 AND (state='assigned' OR (state='pending' AND julianday(due_at)<=julianday('now'))))
BEGIN SELECT RAISE(ABORT,'Complete assigned QC education before recording another QC.'); END;
CREATE TRIGGER IF NOT EXISTS qc_education_record AFTER INSERT ON records
WHEN NEW.status IN ('pass','exception') AND COALESCE(json_extract(NEW.snapshot,'$.historical'),0)=0
BEGIN
 UPDATE qc_education_assignments SET state='cancelled',reason='Passing repeat recorded within 24 hours'
 WHERE state='pending' AND julianday(due_at)>julianday('now') AND NEW.status='pass'
 AND json_extract(NEW.snapshot,'$.input.repeatOf') IS NOT NULL
 AND series_id=COALESCE(json_extract(NEW.snapshot,'$.input.seriesId'),NEW.id);
 UPDATE qc_education_assignments SET state='assigned',assigned_at=NEW.created_at,reason='Repeat QC failed'
 WHERE state='pending' AND NEW.status='exception' AND json_extract(NEW.snapshot,'$.input.repeatOf') IS NOT NULL
 AND series_id=COALESCE(json_extract(NEW.snapshot,'$.input.seriesId'),NEW.id);
 INSERT OR IGNORE INTO qc_education_assignments
 (id,operator_id,series_id,record_id,state,created_at,due_at,assigned_at,reason)
 SELECT 'education:'||NEW.id,NEW.operator_id,COALESCE(json_extract(NEW.snapshot,'$.input.seriesId'),NEW.id),NEW.id,
 CASE WHEN json_extract(NEW.snapshot,'$.input.repeatOf') IS NULL THEN 'pending' ELSE 'assigned' END,
 NEW.created_at,strftime('%Y-%m-%dT%H:%M:%fZ',NEW.occurred_at,'+24 hours'),
 CASE WHEN json_extract(NEW.snapshot,'$.input.repeatOf') IS NULL THEN NULL ELSE NEW.created_at END,
 CASE WHEN json_extract(NEW.snapshot,'$.input.repeatOf') IS NULL THEN 'No passing repeat within 24 hours' ELSE 'Repeat QC failed' END
 WHERE NEW.status='exception' AND NOT EXISTS(SELECT 1 FROM qc_education_assignments WHERE operator_id=NEW.operator_id AND series_id=COALESCE(json_extract(NEW.snapshot,'$.input.seriesId'),NEW.id) AND state IN ('pending','assigned'));
 INSERT OR IGNORE INTO qc_education_items(assignment_id,document_id)
 SELECT a.id,d.id FROM qc_education_assignments a JOIN qc_education_documents d ON d.active=1 AND d.required=1
 WHERE a.record_id=NEW.id AND a.state IN ('pending','assigned');
END;

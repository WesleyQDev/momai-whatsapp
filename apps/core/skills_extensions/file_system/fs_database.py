import sqlite3
import os
from pathlib import Path
from typing import List, Dict

class FileIndexDB:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        conn = sqlite3.connect(self.db_path)
        # Performance Tuning Pragma settings
        conn.execute("PRAGMA journal_mode = WAL")  # Write Ahead Logging for better concurrency
        conn.execute("PRAGMA synchronous = NORMAL") # Reduced locking for better speed
        conn.execute("PRAGMA cache_size = 5000")   # Larger cache (5000 pages, about ~20MB)
        conn.execute("PRAGMA threads = 4")         # Parallel worker threads (if FTS supports)
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Standard table for metadata (id is unique rowid)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS folders_index (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    depth INTEGER NOT NULL,
                    last_mtime REAL NOT NULL
                )
            """)
            
            # FTS5 table for fast searches
            try:
                # We prioritize name, then path
                cursor.execute("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS folders_fts USING fts5(
                        name,
                        path,
                        content='folders_index',
                        content_rowid='id',
                        tokenize='porter unicode61'
                    )
                """)
                # Triggers to keep FTS in sync
                cursor.execute("""
                    CREATE TRIGGER IF NOT EXISTS folders_ai AFTER INSERT ON folders_index BEGIN
                        INSERT INTO folders_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
                    END;
                """)
                cursor.execute("""
                    CREATE TRIGGER IF NOT EXISTS folders_ad AFTER DELETE ON folders_index BEGIN
                        INSERT INTO folders_fts(folders_fts, rowid, name, path) VALUES('delete', old.id, old.name, old.path);
                    END;
                """)
                cursor.execute("""
                    CREATE TRIGGER IF NOT EXISTS folders_au AFTER UPDATE ON folders_index BEGIN
                        INSERT INTO folders_fts(folders_fts, rowid, name, path) VALUES('delete', old.id, old.name, old.path);
                        INSERT INTO folders_fts(rowid, name, path) VALUES (new.id, new.name, new.path);
                    END;
                """)
            except sqlite3.OperationalError:
                pass
            
            conn.commit()

    def is_empty(self) -> bool:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM folders_index")
            return cursor.fetchone()[0] == 0

    def insert_folders(self, folders: List[Dict]):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Multi-threading optimization: WAL handles concurrent writes
            cursor.executemany("""
                INSERT OR IGNORE INTO folders_index (name, path, depth, last_mtime)
                VALUES (:name, :path, :depth, :last_mtime)
            """, folders)
            conn.commit()

    def search(self, query: str, limit: int = 15) -> List[Dict]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            try:
                # Optimized search: Rank by name match exactly, then partial
                clean_query = query.replace('"', '').replace("'", "")
                # Search name column first for priority results
                search_expr = f'name:"{clean_query}"* OR "{clean_query}"*'
                
                cursor.execute("""
                    SELECT name, path 
                    FROM folders_fts 
                    WHERE folders_fts MATCH ? 
                    ORDER BY rank 
                    LIMIT ?
                """, (search_expr, limit))
                return [{"name": r[0], "path": r[1]} for r in cursor.fetchall()]
            except sqlite3.OperationalError:
                cursor.execute("""
                    SELECT name, path FROM folders_index 
                    WHERE name LIKE ? OR path LIKE ? 
                    LIMIT ?
                """, (f"%{query}%", f"%{query}%", limit))
                return [{"name": r[0], "path": r[1]} for r in cursor.fetchall()]

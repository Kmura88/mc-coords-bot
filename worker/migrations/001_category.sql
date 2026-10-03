-- カテゴリ列を追加（既存の座標は「その他」になる）
ALTER TABLE points ADD COLUMN category TEXT NOT NULL DEFAULT 'other';

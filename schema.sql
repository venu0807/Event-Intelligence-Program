-- ================================================================
--  Event Intelligence Platform  |  MySQL Schema
--  Engine: InnoDB  |  Charset: utf8mb4
-- ================================================================

CREATE DATABASE IF NOT EXISTS event_intelligence
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE event_intelligence;

-- ----------------------------------------------------------------
-- users
--   Stores registered accounts. password_hash uses bcrypt (60 chars).
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- events
--   One row per news article fetched and classified by the backend.
--   risk_category is the output of the deterministic classifier.
--   article_score is the computed 0-100 score for this article.
--   keyword_matches stores debug JSON of which keywords fired.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(1000)  NOT NULL,
  description      TEXT,
  source_name      VARCHAR(255),
  url              TEXT,
  published_at     DATETIME,
  risk_category    ENUM('Geopolitical','Monetary','Commodity','SupplyChain','General') NOT NULL,
  article_score    DECIMAL(5,2)   NOT NULL DEFAULT 0.00,
  keyword_matches  JSON,
  created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_category   (risk_category),
  INDEX idx_events_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- impact_assessments
--   One row per analysis run triggered by a user.
--   overall_score and impact_level are the aggregate outputs.
--   category_breakdown stores JSON percentage map per category.
--   ai_summary stores the Gemini-generated executive brief.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impact_assessments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  triggered_by        INT UNSIGNED,
  overall_score       DECIMAL(5,2)  NOT NULL,
  impact_level        ENUM('LOW','MEDIUM','HIGH') NOT NULL,
  dominant_category   ENUM('Geopolitical','Monetary','Commodity','SupplyChain','General') NOT NULL,
  category_breakdown  JSON          NOT NULL,
  article_count       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ai_summary          LONGTEXT,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessment_user
    FOREIGN KEY (triggered_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_assessments_user    (triggered_by),
  INDEX idx_assessments_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------
-- assessment_events
--   Junction table: links each analysis run to the events it processed.
--   Allows an event to appear in multiple runs without duplication.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assessment_events (
  assessment_id INT UNSIGNED NOT NULL,
  event_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (assessment_id, event_id),
  CONSTRAINT fk_ae_assessment
    FOREIGN KEY (assessment_id) REFERENCES impact_assessments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ae_event
    FOREIGN KEY (event_id) REFERENCES events(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

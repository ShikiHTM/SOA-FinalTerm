package database

import (
	"context"
	"fmt"
	"time"

	"applications/submission-service/internal/config"
	"applications/submission-service/internal/submission"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	maxOpenConns    = 25
	maxIdleConns    = 10
	connMaxLifetime = 5 * time.Minute
)

func Open(cfg config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBName,
		cfg.DBSSLMode,
	)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		PrepareStmt: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open postgres connection: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("unwrap sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(maxOpenConns)
	sqlDB.SetMaxIdleConns(maxIdleConns)
	sqlDB.SetConnMaxLifetime(connMaxLifetime)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return db, nil
}

func SyncSchema(ctx context.Context, db *gorm.DB) error {
	enumStatements := []string{
		`DO $$ BEGIN CREATE TYPE submission_mode AS ENUM ('CONTEST', 'PRACTICE'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
		`DO $$ BEGIN CREATE TYPE submission_trigger_type AS ENUM ('MANUAL', 'AUTO_TIMEOUT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
		`DO $$ BEGIN CREATE TYPE submission_grading_status AS ENUM ('QUEUED', 'AUTO_GRADED', 'PENDING_MANUAL', 'GRADED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
		`DO $$ BEGIN CREATE TYPE question_type AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'FILL_IN_THE_BLANK', 'ESSAY'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
		`DO $$ BEGIN CREATE TYPE answer_grading_status AS ENUM ('PENDING', 'AUTO_GRADED', 'MANUALLY_GRADED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
	}
	for _, stmt := range enumStatements {
		if err := db.WithContext(ctx).Exec(stmt).Error; err != nil {
			return fmt.Errorf("ensure postgres enum: %w", err)
		}
	}
	if err := db.WithContext(ctx).AutoMigrate(&submission.Submission{}, &submission.Answer{}); err != nil {
		return fmt.Errorf("auto-migrate submission schema: %w", err)
	}
	return nil
}

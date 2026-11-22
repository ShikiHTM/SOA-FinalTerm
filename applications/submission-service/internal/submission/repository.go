package submission

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"gorm.io/gorm"
)

type AttemptFilter struct {
	UserID       string
	ContestID    *string
	AssessmentID string
	Mode         Mode
}

type ListFilter struct {
	UserID         string
	GroupID        string
	ContestID      string
	AssessmentID   string
	GradingStatus  GradingStatus
	SubmissionMode Mode
	FinalOnly      bool
	Page           int
	Limit          int
}

type ManualGradeUpdate struct {
	QuestionID string
	Points     float64
	Feedback   *string
}

type Store interface {
	FindByID(ctx context.Context, id string) (Submission, error)
	FindByIdempotencyKey(ctx context.Context, key string) (Submission, error)
	CountAttempts(ctx context.Context, filter AttemptFilter) (int64, error)
	CreateSubmissionWithAttempt(ctx context.Context, sub Submission) (Submission, error)
	SaveAutoGradeResult(ctx context.Context, submissionID string, outcome AutoGradeOutcome) error
	MarkGradingFailed(ctx context.Context, submissionID string, now time.Time) error
	ApplyManualGrades(ctx context.Context, submissionID string, updates []ManualGradeUpdate, graderID string, now time.Time) (Submission, error)
	List(ctx context.Context, filter ListFilter) (PaginatedSubmissions, error)
}

type GormStore struct {
	db *gorm.DB
}

func NewGormStore(db *gorm.DB) *GormStore {
	return &GormStore{db: db}
}

func applyAttemptScope(tx *gorm.DB, filter AttemptFilter) *gorm.DB {
	query := tx.Model(&Submission{}).Where("user_id = ?", filter.UserID)
	if filter.Mode == ModeContest && filter.ContestID != nil {
		return query.Where("submission_mode = ? AND contest_id = ?", ModeContest, *filter.ContestID)
	}
	return query.Where("submission_mode = ? AND assessment_id = ?", ModePractice, filter.AssessmentID)
}

func (r *GormStore) FindByID(ctx context.Context, id string) (Submission, error) {
	var sub Submission
	err := r.db.WithContext(ctx).
		Preload("Answers", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("question_id ASC")
		}).
		Where("id = ?", id).
		First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Submission{}, NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	if err != nil {
		return Submission{}, fmt.Errorf("find submission by id: %w", err)
	}
	return sub, nil
}

func (r *GormStore) FindByIdempotencyKey(ctx context.Context, key string) (Submission, error) {
	var sub Submission
	err := r.db.WithContext(ctx).
		Preload("Answers", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("question_id ASC")
		}).
		Where("idempotency_key = ?", key).
		First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Submission{}, NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	if err != nil {
		return Submission{}, fmt.Errorf("find submission by idempotency key: %w", err)
	}
	return sub, nil
}

func (r *GormStore) CountAttempts(ctx context.Context, filter AttemptFilter) (int64, error) {
	var count int64
	err := applyAttemptScope(r.db.WithContext(ctx), filter).Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count submission attempts: %w", err)
	}
	return count, nil
}

func (r *GormStore) CreateSubmissionWithAttempt(ctx context.Context, sub Submission) (Submission, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		scope := AttemptFilter{
			UserID:       sub.UserID,
			ContestID:    sub.ContestID,
			AssessmentID: sub.AssessmentID,
			Mode:         sub.SubmissionMode,
		}
		var priorCount int64
		if err := applyAttemptScope(tx, scope).Count(&priorCount).Error; err != nil {
			return fmt.Errorf("count prior attempts: %w", err)
		}
		sub.AttemptNumber = int(priorCount) + 1
		sub.IsFinalAttempt = true

		if priorCount > 0 {
			if err := applyAttemptScope(tx, scope).
				Where("is_final_attempt = ?", true).
				Updates(map[string]any{
					"is_final_attempt": false,
					"updated_at":       sub.UpdatedAt,
				}).Error; err != nil {
				return fmt.Errorf("clear prior final attempts: %w", err)
			}
		}

		if err := tx.Create(&sub).Error; err != nil {
			return fmt.Errorf("create submission: %w", err)
		}
		return nil
	})
	if err != nil {
		return Submission{}, err
	}
	return sub, nil
}

func (r *GormStore) SaveAutoGradeResult(
	ctx context.Context,
	submissionID string,
	outcome AutoGradeOutcome,
) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("submission_id = ?", submissionID).Delete(&Answer{}).Error; err != nil {
			return fmt.Errorf("replace submission answers: %w", err)
		}
		if len(outcome.Answers) > 0 {
			if err := tx.Create(&outcome.Answers).Error; err != nil {
				return fmt.Errorf("insert graded answers: %w", err)
			}
		}
		updates := map[string]any{
			"grading_status":  outcome.GradingStatus,
			"objective_score": outcome.ObjectiveScore,
			"essay_score":     outcome.EssayScore,
			"total_score":     outcome.TotalScore,
			"max_score":       outcome.MaxScore,
			"auto_graded_at":  outcome.AutoGradedAt,
			"final_graded_at": outcome.FinalGradedAt,
			"updated_at":      outcome.AutoGradedAt,
		}
		if err := tx.Model(&Submission{}).Where("id = ?", submissionID).Updates(updates).Error; err != nil {
			return fmt.Errorf("update auto-graded submission: %w", err)
		}
		return nil
	})
}

func (r *GormStore) MarkGradingFailed(ctx context.Context, submissionID string, now time.Time) error {
	err := r.db.WithContext(ctx).
		Model(&Submission{}).
		Where("id = ?", submissionID).
		Updates(map[string]any{
			"grading_status": StatusFailed,
			"updated_at":     now,
		}).Error
	if err != nil {
		return fmt.Errorf("mark grading failed: %w", err)
	}
	return nil
}

func (r *GormStore) ApplyManualGrades(
	ctx context.Context,
	submissionID string,
	updates []ManualGradeUpdate,
	graderID string,
	now time.Time,
) (Submission, error) {
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, item := range updates {
			answerUpdate := map[string]any{
				"earned_points":   RoundScore(item.Points),
				"grading_status":  AnswerManuallyGraded,
				"grader_id":       graderID,
				"grader_feedback": item.Feedback,
				"graded_at":       now,
			}
			if err := tx.Model(&Answer{}).
				Where("submission_id = ? AND question_id = ? AND question_type = ?", submissionID, item.QuestionID, QuestionEssay).
				Updates(answerUpdate).Error; err != nil {
				return fmt.Errorf("update essay answer %s: %w", item.QuestionID, err)
			}
		}

		var sub Submission
		if err := tx.Preload("Answers").Where("id = ?", submissionID).First(&sub).Error; err != nil {
			return fmt.Errorf("reload submission after essay grading: %w", err)
		}

		allEssaysGraded := true
		var essaySum float64
		for _, ans := range sub.Answers {
			if ans.QuestionType == QuestionEssay {
				if ans.GradingStatus != AnswerManuallyGraded || ans.EarnedPoints == nil {
					allEssaysGraded = false
					break
				}
				essaySum += *ans.EarnedPoints
			}
		}

		submissionUpdate := map[string]any{
			"updated_at": now,
		}
		if allEssaysGraded {
			roundedEssay := RoundScore(essaySum)
			var objective float64
			if sub.ObjectiveScore != nil {
				objective = *sub.ObjectiveScore
			}
			total := RoundScore(objective + roundedEssay)
			submissionUpdate["essay_score"] = roundedEssay
			submissionUpdate["total_score"] = total
			submissionUpdate["grading_status"] = StatusGraded
			submissionUpdate["final_graded_at"] = now
		}

		if err := tx.Model(&Submission{}).Where("id = ?", submissionID).Updates(submissionUpdate).Error; err != nil {
			return fmt.Errorf("finalize manual submission grade: %w", err)
		}
		return nil
	})
	if err != nil {
		return Submission{}, err
	}
	return r.FindByID(ctx, submissionID)
}

func (r *GormStore) List(ctx context.Context, filter ListFilter) (PaginatedSubmissions, error) {
	query := r.db.WithContext(ctx).Model(&Submission{})
	if filter.UserID != "" {
		query = query.Where("user_id = ?", filter.UserID)
	}
	if filter.GroupID != "" {
		query = query.Where("group_id = ?", filter.GroupID)
	}
	if filter.ContestID != "" {
		query = query.Where("contest_id = ?", filter.ContestID)
	}
	if filter.AssessmentID != "" {
		query = query.Where("assessment_id = ?", filter.AssessmentID)
	}
	if filter.GradingStatus != "" {
		query = query.Where("grading_status = ?", filter.GradingStatus)
	}
	if filter.SubmissionMode != "" {
		query = query.Where("submission_mode = ?", filter.SubmissionMode)
	}
	if filter.FinalOnly {
		query = query.Where("is_final_attempt = ?", true)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return PaginatedSubmissions{}, fmt.Errorf("count submissions: %w", err)
	}

	offset := (filter.Page - 1) * filter.Limit
	var items []Submission
	if err := query.Order("submitted_at DESC").Limit(filter.Limit).Offset(offset).Find(&items).Error; err != nil {
		return PaginatedSubmissions{}, fmt.Errorf("list submissions: %w", err)
	}
	if items == nil {
		items = []Submission{}
	}

	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(filter.Limit)))
	}

	return PaginatedSubmissions{
		Items: items,
		Pagination: PaginationMeta{
			Page:       filter.Page,
			Limit:      filter.Limit,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

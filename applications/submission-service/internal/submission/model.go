package submission

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

type Mode string

const (
	ModeContest  Mode = "CONTEST"
	ModePractice Mode = "PRACTICE"
)

type TriggerType string

const (
	TriggerManual      TriggerType = "MANUAL"
	TriggerAutoTimeout TriggerType = "AUTO_TIMEOUT"
)

type GradingStatus string

const (
	StatusQueued        GradingStatus = "QUEUED"
	StatusAutoGraded    GradingStatus = "AUTO_GRADED"
	StatusPendingManual GradingStatus = "PENDING_MANUAL"
	StatusGraded        GradingStatus = "GRADED"
	StatusFailed        GradingStatus = "FAILED"
)

type QuestionType string

const (
	QuestionSingleChoice   QuestionType = "SINGLE_CHOICE"
	QuestionMultipleChoice QuestionType = "MULTIPLE_CHOICE"
	QuestionFillInTheBlank QuestionType = "FILL_IN_THE_BLANK"
	QuestionEssay          QuestionType = "ESSAY"
)

type AnswerGradingStatus string

const (
	AnswerPending        AnswerGradingStatus = "PENDING"
	AnswerAutoGraded     AnswerGradingStatus = "AUTO_GRADED"
	AnswerManuallyGraded AnswerGradingStatus = "MANUALLY_GRADED"
)

type JSONB json.RawMessage

func (j JSONB) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j *JSONB) Scan(value any) error {
	if value == nil {
		*j = nil
		return nil
	}
	switch v := value.(type) {
	case []byte:
		*j = append((*j)[0:0], v...)
		return nil
	case string:
		*j = append((*j)[0:0], v...)
		return nil
	default:
		return errors.New("unsupported type for JSONB")
	}
}

func (j JSONB) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}

func (j *JSONB) UnmarshalJSON(data []byte) error {
	if j == nil {
		return errors.New("JSONB: UnmarshalJSON on nil pointer")
	}
	*j = append((*j)[0:0], data...)
	return nil
}

func (JSONB) GormDataType() string {
	return "jsonb"
}

type Submission struct {
	ID                string        `gorm:"type:uuid;primaryKey" json:"id"`
	UserID            string        `gorm:"column:user_id;type:uuid;not null;index:idx_submissions_user_id" json:"user_id"`
	GroupID           string        `gorm:"column:group_id;type:uuid;not null;index:idx_submissions_group_id" json:"group_id"`
	ContestID         *string       `gorm:"column:contest_id;type:uuid;index:idx_submissions_contest_id" json:"contest_id"`
	AssessmentID      string        `gorm:"column:assessment_id;type:uuid;not null;index:idx_submissions_assessment_id" json:"assessment_id"`
	AssessmentVersion int           `gorm:"column:assessment_version;not null" json:"assessment_version"`
	SubmissionMode    Mode          `gorm:"column:submission_mode;type:submission_mode;not null" json:"submission_mode"`
	TriggerType       TriggerType   `gorm:"column:trigger_type;type:submission_trigger_type;not null" json:"trigger_type"`
	AttemptNumber     int           `gorm:"column:attempt_number;not null" json:"attempt_number"`
	IsFinalAttempt    bool          `gorm:"column:is_final_attempt;not null;default:true" json:"is_final_attempt"`
	GradingStatus     GradingStatus `gorm:"column:grading_status;type:submission_grading_status;not null;default:'QUEUED';index:idx_submissions_grading_status" json:"grading_status"`
	ObjectiveScore    *float64      `gorm:"column:objective_score;type:numeric(10,2)" json:"objective_score"`
	EssayScore        *float64      `gorm:"column:essay_score;type:numeric(10,2)" json:"essay_score"`
	TotalScore        *float64      `gorm:"column:total_score;type:numeric(10,2)" json:"total_score"`
	MaxScore          float64       `gorm:"column:max_score;type:numeric(10,2);not null" json:"max_score"`
	IdempotencyKey    *string       `gorm:"column:idempotency_key;type:varchar(128);uniqueIndex:idx_submissions_idempotency_key" json:"idempotency_key,omitempty"`
	SubmittedAt       time.Time     `gorm:"column:submitted_at;type:timestamptz;not null" json:"submitted_at"`
	AutoGradedAt      *time.Time    `gorm:"column:auto_graded_at;type:timestamptz" json:"auto_graded_at"`
	FinalGradedAt     *time.Time    `gorm:"column:final_graded_at;type:timestamptz" json:"final_graded_at"`
	CreatedAt         time.Time     `gorm:"column:created_at;type:timestamptz;not null;default:now()" json:"created_at"`
	UpdatedAt         time.Time     `gorm:"column:updated_at;type:timestamptz;not null;default:now()" json:"updated_at"`
	Answers           []Answer      `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnDelete:CASCADE" json:"answers,omitempty"`
}

func (Submission) TableName() string {
	return "submissions"
}

type Answer struct {
	ID                     string              `gorm:"type:uuid;primaryKey" json:"id"`
	SubmissionID           string              `gorm:"column:submission_id;type:uuid;not null;index:idx_submission_answers_submission_id" json:"submission_id"`
	QuestionID             string              `gorm:"column:question_id;type:varchar(100);not null" json:"question_id"`
	QuestionType           QuestionType        `gorm:"column:question_type;type:question_type;not null" json:"question_type"`
	StudentResponse        JSONB               `gorm:"column:student_response;type:jsonb;not null" json:"student_response"`
	ExpectedAnswerSnapshot JSONB               `gorm:"column:expected_answer_snapshot;type:jsonb" json:"expected_answer_snapshot,omitempty"`
	MaxPoints              float64             `gorm:"column:max_points;type:numeric(10,2);not null" json:"max_points"`
	EarnedPoints           *float64            `gorm:"column:earned_points;type:numeric(10,2)" json:"earned_points"`
	IsCorrect              *bool               `gorm:"column:is_correct" json:"is_correct"`
	GradingStatus          AnswerGradingStatus `gorm:"column:grading_status;type:answer_grading_status;not null;default:'PENDING'" json:"grading_status"`
	GraderID               *string             `gorm:"column:grader_id;type:uuid" json:"grader_id"`
	GraderFeedback         *string             `gorm:"column:grader_feedback;type:text" json:"grader_feedback"`
	GradedAt               *time.Time          `gorm:"column:graded_at;type:timestamptz" json:"graded_at"`
}

func (Answer) TableName() string {
	return "submission_answers"
}

type PaginationMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"total_pages"`
}

type PaginatedSubmissions struct {
	Items      []Submission   `json:"items"`
	Pagination PaginationMeta `json:"pagination"`
}

type AppError struct {
	StatusCode int
	ErrorCode  string
	Message    string
	Details    []string
}

func (e *AppError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("%d %s", e.StatusCode, e.ErrorCode)
}

func NewAppError(status int, code, message string, details ...string) *AppError {
	return &AppError{
		StatusCode: status,
		ErrorCode:  code,
		Message:    message,
		Details:    details,
	}
}

func BadRequest(code, message string, details ...string) *AppError {
	return NewAppError(http.StatusBadRequest, code, message, details...)
}

func Unauthorized(code, message string) *AppError {
	return NewAppError(http.StatusUnauthorized, code, message)
}

func Forbidden(code, message string) *AppError {
	return NewAppError(http.StatusForbidden, code, message)
}

func NotFound(code, message string) *AppError {
	return NewAppError(http.StatusNotFound, code, message)
}

func Conflict(code, message string) *AppError {
	return NewAppError(http.StatusConflict, code, message)
}

func BadGateway(code, message string) *AppError {
	return NewAppError(http.StatusBadGateway, code, message)
}

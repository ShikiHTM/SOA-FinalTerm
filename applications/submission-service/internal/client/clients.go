package client

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"applications/submission-service/internal/config"
)

type GroupMembership struct {
	GroupID     string  `json:"group_id"`
	UserID      string  `json:"user_id"`
	GroupStatus string  `json:"group_status"`
	Visibility  string  `json:"visibility"`
	IsMember    bool    `json:"is_member"`
	IsBanned    bool    `json:"is_banned"`
	Role        *string `json:"role"`
	CanManage   bool    `json:"can_manage"`
	IsOwner     bool    `json:"is_owner"`
}

type AssessmentSummary struct {
	ID                string  `json:"id"`
	GroupID           string  `json:"group_id"`
	CreatedBy         string  `json:"created_by"`
	AssessmentType    string  `json:"assessment_type"`
	Version           int     `json:"version"`
	QuestionCount     int     `json:"question_count"`
	TotalPoints       float64 `json:"total_points"`
	HasEssayItems     bool    `json:"has_essay_items"`
	HasAnswerKey      bool    `json:"has_answer_key"`
	IsPracticeEnabled bool    `json:"is_practice_enabled"`
	Visibility        string  `json:"visibility"`
	Status            string  `json:"status"`
}

type AnswerKeyItem struct {
	QuestionID    string          `json:"question_id"`
	QuestionType  string          `json:"question_type"`
	Points        float64         `json:"points"`
	CorrectAnswer json.RawMessage `json:"correct_answer"`
	GradingRubric *string         `json:"grading_rubric"`
}

type GradingData struct {
	AssessmentID      string          `json:"assessment_id"`
	GroupID           string          `json:"group_id"`
	Version           int             `json:"version"`
	AssessmentType    string          `json:"assessment_type"`
	IsPracticeEnabled bool            `json:"is_practice_enabled"`
	HasEssay          bool            `json:"has_essay"`
	TotalPoints       float64         `json:"total_points"`
	Answers           []AnswerKeyItem `json:"answers"`
}

type ContestSubmissionContext struct {
	ContestID         string  `json:"contest_id"`
	GroupID           string  `json:"group_id"`
	AssessmentID      string  `json:"assessment_id"`
	AssessmentVersion int     `json:"assessment_version"`
	OrganizerID       string  `json:"organizer_id"`
	Visibility        string  `json:"visibility"`
	Status            string  `json:"status"`
	Phase             string  `json:"phase"`
	StartTime         string  `json:"start_time"`
	EndTime           string  `json:"end_time"`
	SubmissionPolicy  string  `json:"submission_policy"`
	EvaluationRule    string  `json:"evaluation_rule"`
	IsGroupMember     bool    `json:"is_group_member"`
	CanSubmit         bool    `json:"can_submit"`
	DenialReason      *string `json:"denial_reason"`
}

type UpstreamError struct {
	StatusCode int
	Service    string
}

func (e *UpstreamError) Error() string {
	return fmt.Sprintf("%s returned HTTP %d", e.Service, e.StatusCode)
}

type Upstream interface {
	GetGroupMembership(ctx context.Context, groupID, userID string) (GroupMembership, error)
	GetAssessmentSummary(ctx context.Context, assessmentID string) (AssessmentSummary, error)
	GetGradingData(ctx context.Context, assessmentID string, version int) (GradingData, error)
	GetContestSubmissionContext(ctx context.Context, contestID, userID string) (ContestSubmissionContext, error)
}

type HTTPClients struct {
	httpClient           *http.Client
	internalSecret       string
	groupServiceURL      string
	assessmentServiceURL string
	contestServiceURL    string
}

const defaultRequestTimeout = 5 * time.Second

func NewHTTPClients(cfg config.Config) *HTTPClients {
	return &HTTPClients{
		httpClient:           &http.Client{Timeout: defaultRequestTimeout},
		internalSecret:       cfg.InternalServiceSecret,
		groupServiceURL:      cfg.GroupServiceURL,
		assessmentServiceURL: cfg.AssessmentServiceURL,
		contestServiceURL:    cfg.ContestServiceURL,
	}
}

func (c *HTTPClients) getJSON(ctx context.Context, service, endpoint string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("create request for %s: %w", service, err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Internal-Secret", c.internalSecret)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("call %s: %w", service, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, resp.Body)
		return &UpstreamError{StatusCode: resp.StatusCode, Service: service}
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode %s response: %w", service, err)
	}
	return nil
}

func (c *HTTPClients) GetGroupMembership(ctx context.Context, groupID, userID string) (GroupMembership, error) {
	var result GroupMembership
	endpoint := fmt.Sprintf(
		"%s/api/v1/internal/groups/%s/members/%s",
		c.groupServiceURL,
		url.PathEscape(groupID),
		url.PathEscape(userID),
	)
	if err := c.getJSON(ctx, "group-service", endpoint, &result); err != nil {
		return GroupMembership{}, err
	}
	return result, nil
}

func (c *HTTPClients) GetAssessmentSummary(ctx context.Context, assessmentID string) (AssessmentSummary, error) {
	var result AssessmentSummary
	endpoint := fmt.Sprintf(
		"%s/api/v1/internal/assessments/%s/summary",
		c.assessmentServiceURL,
		url.PathEscape(assessmentID),
	)
	if err := c.getJSON(ctx, "assessment-service", endpoint, &result); err != nil {
		return AssessmentSummary{}, err
	}
	return result, nil
}

func (c *HTTPClients) GetGradingData(ctx context.Context, assessmentID string, version int) (GradingData, error) {
	var result GradingData
	endpoint := fmt.Sprintf(
		"%s/api/v1/internal/assessments/%s/grading-data?version=%d",
		c.assessmentServiceURL,
		url.PathEscape(assessmentID),
		version,
	)
	if err := c.getJSON(ctx, "assessment-service", endpoint, &result); err != nil {
		return GradingData{}, err
	}
	return result, nil
}

func (c *HTTPClients) GetContestSubmissionContext(ctx context.Context, contestID, userID string) (ContestSubmissionContext, error) {
	var result ContestSubmissionContext
	endpoint := fmt.Sprintf(
		"%s/api/v1/internal/contests/%s/submission-context?user_id=%s",
		c.contestServiceURL,
		url.PathEscape(contestID),
		url.QueryEscape(userID),
	)
	if err := c.getJSON(ctx, "contest-service", endpoint, &result); err != nil {
		return ContestSubmissionContext{}, err
	}
	return result, nil
}

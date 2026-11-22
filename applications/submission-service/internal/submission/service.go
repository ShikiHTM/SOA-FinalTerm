package submission

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"applications/submission-service/internal/client"
	"applications/submission-service/internal/kafka"
	"github.com/google/uuid"
)

type SubmittedAnswerInput struct {
	QuestionID      string       `json:"question_id"`
	QuestionType    QuestionType `json:"question_type"`
	StudentResponse JSONB        `json:"student_response"`
}

type CreateSubmissionInput struct {
	SubmissionMode Mode                   `json:"submission_mode"`
	TriggerType    TriggerType            `json:"trigger_type"`
	ContestID      *string                `json:"contest_id"`
	AssessmentID   *string                `json:"assessment_id"`
	Answers        []SubmittedAnswerInput `json:"answers"`
}

type CreateSubmissionResult struct {
	Submission Submission
	Replayed   bool
}

type Service struct {
	store    Store
	upstream client.Upstream
	broker   kafka.Broker
}

func NewService(store Store, upstream client.Upstream, broker kafka.Broker) *Service {
	return &Service{
		store:    store,
		upstream: upstream,
		broker:   broker,
	}
}

func mapUpstreamError(err error, notFoundCode, notFoundMessage, unavailableCode, unavailableMessage string) error {
	var upstreamErr *client.UpstreamError
	if errors.As(err, &upstreamErr) && upstreamErr.StatusCode == http.StatusNotFound {
		return NotFound(notFoundCode, notFoundMessage)
	}
	return BadGateway(unavailableCode, unavailableMessage)
}

func mapContestDenialError(reason string) error {
	switch reason {
	case "GROUP_SUSPENDED":
		return Forbidden("GROUP_SUSPENDED", "Owning group is currently suspended.")
	case "GROUP_BANNED":
		return Forbidden("GROUP_ACCESS_DENIED", "You are banned from this group.")
	case "GROUP_MEMBERSHIP_REQUIRED":
		return Forbidden("GROUP_MEMBERSHIP_REQUIRED", "Group membership is required to submit in this contest.")
	case "CONTEST_NOT_PUBLISHED":
		return Forbidden("CONTEST_NOT_PUBLISHED", "Contest has not been published.")
	case "CONTEST_CANCELLED":
		return Conflict("CONTEST_CANCELLED", "Contest has been cancelled.")
	case "CONTEST_NOT_STARTED":
		return Forbidden("CONTEST_NOT_STARTED", "Contest has not started yet.")
	case "CONTEST_ENDED":
		return Forbidden("CONTEST_ENDED", "Contest submission window has closed.")
	default:
		return Forbidden("CONTEST_SUBMISSION_DENIED", "You are not permitted to submit to this contest.")
	}
}

func sanitizeSubmissionForViewer(sub Submission, includeAnswerKey bool) Submission {
	if len(sub.Answers) == 0 {
		return sub
	}
	sanitizedAnswers := make([]Answer, len(sub.Answers))
	copy(sanitizedAnswers, sub.Answers)
	if !includeAnswerKey {
		for i := range sanitizedAnswers {
			sanitizedAnswers[i].ExpectedAnswerSnapshot = nil
		}
	}
	sub.Answers = sanitizedAnswers
	return sub
}

func buildInitialAnswers(submissionID string, inputs []SubmittedAnswerInput) []Answer {
	answers := make([]Answer, 0, len(inputs))
	for _, input := range inputs {
		qType := input.QuestionType
		if qType == "" {
			qType = QuestionSingleChoice
		}
		rawResponse := input.StudentResponse
		if len(rawResponse) == 0 {
			rawResponse = JSONB("null")
		}
		answers = append(answers, Answer{
			ID:              uuid.NewString(),
			SubmissionID:    submissionID,
			QuestionID:      input.QuestionID,
			QuestionType:    qType,
			StudentResponse: rawResponse,
			MaxPoints:       0,
			GradingStatus:   AnswerPending,
		})
	}
	return answers
}

func (s *Service) requireGroupManagerOrAdmin(
	ctx context.Context,
	groupID, actorID, actorRole, forbiddenMessage string,
) error {
	if actorRole == "ADMIN" {
		return nil
	}
	membership, err := s.upstream.GetGroupMembership(ctx, groupID, actorID)
	if err != nil {
		return mapUpstreamError(
			err,
			"GROUP_NOT_FOUND",
			"Group not found.",
			"GROUP_SERVICE_UNAVAILABLE",
			"Failed to verify group permissions.",
		)
	}
	if membership.GroupStatus != "ACTIVE" {
		return Forbidden("GROUP_SUSPENDED", "Group is currently suspended.")
	}
	if membership.IsBanned {
		return Forbidden("GROUP_ACCESS_DENIED", "You are banned from this group.")
	}
	if !membership.CanManage {
		return Forbidden("INSUFFICIENT_GROUP_ROLE", forbiddenMessage)
	}
	return nil
}

func (s *Service) publishGradedNotification(ctx context.Context, sub Submission) {
	resourceType := "SUBMISSION"
	resourceID := sub.ID
	var body string
	if sub.TotalScore != nil {
		body = fmt.Sprintf("Your submission has been graded: %.2f / %.2f.", *sub.TotalScore, sub.MaxScore)
	} else {
		body = "Your submission grading has finished."
	}
	event := kafka.NotificationEvent{
		EventID:         uuid.NewString(),
		RecipientUserID: sub.UserID,
		Type:            "SUBMISSION_GRADED",
		Title:           "Submission Graded",
		Body:            body,
		ResourceType:    &resourceType,
		ResourceID:      &resourceID,
	}
	if err := s.broker.PublishNotification(ctx, event); err != nil {
		slog.Warn("publish submission graded notification failed", "submission_id", sub.ID, "error", err)
	}
}

func (s *Service) Create(
	ctx context.Context,
	actorID, idempotencyKey string,
	input CreateSubmissionInput,
) (CreateSubmissionResult, error) {
	if idempotencyKey != "" {
		existing, err := s.store.FindByIdempotencyKey(ctx, idempotencyKey)
		if err == nil {
			if existing.UserID != actorID {
				return CreateSubmissionResult{}, Forbidden(
					"IDEMPOTENCY_KEY_CONFLICT",
					"Idempotency key belongs to another user.",
				)
			}
			return CreateSubmissionResult{
				Submission: sanitizeSubmissionForViewer(existing, false),
				Replayed:   true,
			}, nil
		}
		var appErr *AppError
		if !errors.As(err, &appErr) || appErr.StatusCode != http.StatusNotFound {
			return CreateSubmissionResult{}, err
		}
	}

	seenQuestions := make(map[string]struct{}, len(input.Answers))
	for _, ans := range input.Answers {
		if _, dup := seenQuestions[ans.QuestionID]; dup {
			return CreateSubmissionResult{}, BadRequest(
				"DUPLICATE_QUESTION_ANSWER",
				"Duplicate question_id values are not allowed in a single submission.",
			)
		}
		seenQuestions[ans.QuestionID] = struct{}{}
	}

	var (
		groupID           string
		contestID         *string
		assessmentID      string
		assessmentVersion int
		maxScore          float64
	)

	switch input.SubmissionMode {
	case ModeContest:
		if input.ContestID == nil || *input.ContestID == "" {
			return CreateSubmissionResult{}, BadRequest("VALIDATION_ERROR", "contest_id is required for CONTEST mode.")
		}
		contestCtx, err := s.upstream.GetContestSubmissionContext(ctx, *input.ContestID, actorID)
		if err != nil {
			return CreateSubmissionResult{}, mapUpstreamError(
				err,
				"CONTEST_NOT_FOUND",
				"Contest not found.",
				"CONTEST_SERVICE_UNAVAILABLE",
				"Failed to verify contest submission eligibility.",
			)
		}
		if !contestCtx.CanSubmit {
			reason := ""
			if contestCtx.DenialReason != nil {
				reason = *contestCtx.DenialReason
			}
			return CreateSubmissionResult{}, mapContestDenialError(reason)
		}
		if contestCtx.SubmissionPolicy == "SINGLE" {
			attempts, err := s.store.CountAttempts(ctx, AttemptFilter{
				UserID:    actorID,
				ContestID: &contestCtx.ContestID,
				Mode:      ModeContest,
			})
			if err != nil {
				return CreateSubmissionResult{}, err
			}
			if attempts > 0 {
				return CreateSubmissionResult{}, Conflict(
					"SINGLE_ATTEMPT_ALREADY_USED",
					"Only a single attempt is allowed for this contest.",
				)
			}
		}

		summary, err := s.upstream.GetAssessmentSummary(ctx, contestCtx.AssessmentID)
		if err != nil {
			return CreateSubmissionResult{}, mapUpstreamError(
				err,
				"ASSESSMENT_NOT_FOUND",
				"Linked assessment not found.",
				"ASSESSMENT_SERVICE_UNAVAILABLE",
				"Failed to retrieve assessment metadata.",
			)
		}
		if summary.Status != "ACTIVE" {
			return CreateSubmissionResult{}, Forbidden("ASSESSMENT_UNAVAILABLE", "Linked assessment is currently unavailable.")
		}

		cid := contestCtx.ContestID
		groupID = contestCtx.GroupID
		contestID = &cid
		assessmentID = contestCtx.AssessmentID
		assessmentVersion = contestCtx.AssessmentVersion
		maxScore = RoundScore(summary.TotalPoints)

	case ModePractice:
		if input.ContestID != nil && *input.ContestID != "" {
			return CreateSubmissionResult{}, BadRequest("VALIDATION_ERROR", "contest_id cannot be specified in PRACTICE mode.")
		}
		if input.AssessmentID == nil || *input.AssessmentID == "" {
			return CreateSubmissionResult{}, BadRequest("VALIDATION_ERROR", "assessment_id is required for PRACTICE mode.")
		}
		summary, err := s.upstream.GetAssessmentSummary(ctx, *input.AssessmentID)
		if err != nil {
			return CreateSubmissionResult{}, mapUpstreamError(
				err,
				"ASSESSMENT_NOT_FOUND",
				"Assessment not found.",
				"ASSESSMENT_SERVICE_UNAVAILABLE",
				"Failed to retrieve assessment metadata.",
			)
		}
		if summary.Status != "ACTIVE" {
			return CreateSubmissionResult{}, Forbidden("ASSESSMENT_UNAVAILABLE", "Assessment is currently unavailable.")
		}
		if !summary.IsPracticeEnabled {
			return CreateSubmissionResult{}, Forbidden("PRACTICE_NOT_ENABLED", "Open practice is not enabled for this assessment.")
		}

		membership, err := s.upstream.GetGroupMembership(ctx, summary.GroupID, actorID)
		if err != nil {
			return CreateSubmissionResult{}, mapUpstreamError(
				err,
				"GROUP_NOT_FOUND",
				"Owning group not found.",
				"GROUP_SERVICE_UNAVAILABLE",
				"Failed to verify group membership.",
			)
		}
		if membership.GroupStatus != "ACTIVE" {
			return CreateSubmissionResult{}, Forbidden("GROUP_SUSPENDED", "Owning group is currently suspended.")
		}
		if membership.IsBanned {
			return CreateSubmissionResult{}, Forbidden("GROUP_ACCESS_DENIED", "You are banned from this group.")
		}
		if summary.Visibility == "DRAFT" && !membership.CanManage {
			return CreateSubmissionResult{}, Forbidden("ASSESSMENT_NOT_ACCESSIBLE", "Draft assessments are only accessible to group managers.")
		}
		if (summary.Visibility == "PRIVATE" || membership.Visibility == "PRIVATE") && !membership.IsMember {
			return CreateSubmissionResult{}, Forbidden("GROUP_MEMBERSHIP_REQUIRED", "Group membership is required to practice this assessment.")
		}

		groupID = summary.GroupID
		assessmentID = summary.ID
		assessmentVersion = summary.Version
		maxScore = RoundScore(summary.TotalPoints)
	}

	now := time.Now().UTC()
	submissionID := uuid.NewString()
	var idemPtr *string
	if idempotencyKey != "" {
		idemKey := idempotencyKey
		idemPtr = &idemKey
	}

	newSubmission := Submission{
		ID:                submissionID,
		UserID:            actorID,
		GroupID:           groupID,
		ContestID:         contestID,
		AssessmentID:      assessmentID,
		AssessmentVersion: assessmentVersion,
		SubmissionMode:    input.SubmissionMode,
		TriggerType:       input.TriggerType,
		GradingStatus:     StatusQueued,
		MaxScore:          maxScore,
		IdempotencyKey:    idemPtr,
		SubmittedAt:       now,
		CreatedAt:         now,
		UpdatedAt:         now,
		Answers:           buildInitialAnswers(submissionID, input.Answers),
	}

	created, err := s.store.CreateSubmissionWithAttempt(ctx, newSubmission)
	if err != nil {
		return CreateSubmissionResult{}, err
	}

	event := kafka.SubmissionSubmittedEvent{
		EventID:      uuid.NewString(),
		SubmissionID: created.ID,
		SubmittedAt:  now,
	}
	if err := s.broker.PublishSubmission(ctx, event); err != nil {
		_ = s.store.MarkGradingFailed(ctx, created.ID, time.Now().UTC())
		return CreateSubmissionResult{}, BadGateway("QUEUE_PUBLISH_FAILED", "Failed to enqueue submission for grading.")
	}

	return CreateSubmissionResult{
		Submission: sanitizeSubmissionForViewer(created, false),
		Replayed:   false,
	}, nil
}

func (s *Service) ProcessSubmittedEvent(ctx context.Context, event kafka.SubmissionSubmittedEvent) error {
	sub, err := s.store.FindByID(ctx, event.SubmissionID)
	if err != nil {
		var appErr *AppError
		if errors.As(err, &appErr) && appErr.StatusCode == http.StatusNotFound {
			return nil
		}
		return err
	}
	if sub.GradingStatus != StatusQueued {
		return nil
	}

	gradingData, err := s.upstream.GetGradingData(ctx, sub.AssessmentID, sub.AssessmentVersion)
	if err != nil {
		var upstreamErr *client.UpstreamError
		if errors.As(err, &upstreamErr) && upstreamErr.StatusCode >= 400 && upstreamErr.StatusCode < 500 {
			_ = s.store.MarkGradingFailed(ctx, sub.ID, time.Now().UTC())
			return nil
		}
		return err
	}

	now := time.Now().UTC()
	outcome := BuildAutoGradedAnswers(sub.ID, sub.Answers, gradingData.Answers, now)
	if err := s.store.SaveAutoGradeResult(ctx, sub.ID, outcome); err != nil {
		return err
	}

	if outcome.GradingStatus == StatusGraded {
		sub.TotalScore = outcome.TotalScore
		sub.MaxScore = outcome.MaxScore
		s.publishGradedNotification(ctx, sub)
	}
	return nil
}

func (s *Service) GetByID(
	ctx context.Context,
	actorID, actorRole, submissionID string,
) (Submission, error) {
	sub, err := s.store.FindByID(ctx, submissionID)
	if err != nil {
		return Submission{}, err
	}

	isManager := actorRole == "ADMIN"
	if !isManager && sub.UserID != actorID {
		membership, err := s.upstream.GetGroupMembership(ctx, sub.GroupID, actorID)
		if err != nil {
			return Submission{}, mapUpstreamError(
				err,
				"GROUP_NOT_FOUND",
				"Owning group not found.",
				"GROUP_SERVICE_UNAVAILABLE",
				"Failed to verify group permissions.",
			)
		}
		if !membership.CanManage || membership.IsBanned || membership.GroupStatus != "ACTIVE" {
			return Submission{}, Forbidden("SUBMISSION_ACCESS_DENIED", "You do not have permission to view this submission.")
		}
		isManager = true
	}

	includeAnswerKey := isManager || (sub.SubmissionMode == ModePractice && sub.GradingStatus != StatusQueued)
	return sanitizeSubmissionForViewer(sub, includeAnswerKey), nil
}

func (s *Service) ListOwn(ctx context.Context, actorID string, filter ListFilter) (PaginatedSubmissions, error) {
	filter.UserID = actorID
	return s.store.List(ctx, filter)
}

func (s *Service) ListForGroup(
	ctx context.Context,
	actorID, actorRole string,
	filter ListFilter,
) (PaginatedSubmissions, error) {
	if filter.GroupID == "" {
		return PaginatedSubmissions{}, BadRequest("VALIDATION_ERROR", "group_id query parameter is required.")
	}
	if err := s.requireGroupManagerOrAdmin(
		ctx,
		filter.GroupID,
		actorID,
		actorRole,
		"Group moderator or owner role is required to view group submissions.",
	); err != nil {
		return PaginatedSubmissions{}, err
	}
	return s.store.List(ctx, filter)
}

func (s *Service) GradeEssays(
	ctx context.Context,
	actorID, actorRole, submissionID string,
	updates []ManualGradeUpdate,
) (Submission, error) {
	sub, err := s.store.FindByID(ctx, submissionID)
	if err != nil {
		return Submission{}, err
	}
	if err := s.requireGroupManagerOrAdmin(
		ctx,
		sub.GroupID,
		actorID,
		actorRole,
		"Group moderator or owner role is required to grade essay submissions.",
	); err != nil {
		return Submission{}, err
	}
	if sub.GradingStatus == StatusQueued || sub.GradingStatus == StatusFailed {
		return Submission{}, Conflict(
			"SUBMISSION_NOT_READY",
			"Submission must complete automated processing before manual essay grading.",
		)
	}

	essayByQuestion := make(map[string]Answer)
	for _, ans := range sub.Answers {
		if ans.QuestionType == QuestionEssay {
			essayByQuestion[ans.QuestionID] = ans
		}
	}
	if len(essayByQuestion) == 0 {
		return Submission{}, BadRequest("NO_ESSAY_QUESTIONS", "This submission contains no essay items to grade.")
	}

	seen := make(map[string]struct{}, len(updates))
	for _, item := range updates {
		if _, dup := seen[item.QuestionID]; dup {
			return Submission{}, BadRequest("DUPLICATE_QUESTION_GRADE", "Duplicate question_id in manual grade payload.")
		}
		seen[item.QuestionID] = struct{}{}

		ans, ok := essayByQuestion[item.QuestionID]
		if !ok {
			return Submission{}, BadRequest(
				"INVALID_ESSAY_QUESTION",
				fmt.Sprintf("Question %s is not a gradable essay item in this submission.", item.QuestionID),
			)
		}
		if item.Points < 0 || item.Points > ans.MaxPoints {
			return Submission{}, BadRequest(
				"INVALID_GRADE_POINTS",
				fmt.Sprintf("Earned points for question %s must be between 0 and %.2f.", item.QuestionID, ans.MaxPoints),
			)
		}
	}

	updated, err := s.store.ApplyManualGrades(ctx, sub.ID, updates, actorID, time.Now().UTC())
	if err != nil {
		return Submission{}, err
	}
	if updated.GradingStatus == StatusGraded {
		s.publishGradedNotification(ctx, updated)
	}
	return updated, nil
}

func (a *Answer) UnmarshalStudentResponse(target any) error {
	return json.Unmarshal(a.StudentResponse, target)
}

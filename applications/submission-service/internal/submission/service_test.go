package submission

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"time"

	"applications/submission-service/internal/client"
	"applications/submission-service/internal/config"
	"applications/submission-service/internal/kafka"
	"github.com/google/uuid"
	"gorm.io/gorm/schema"
)

type memoryStore struct {
	mu          sync.Mutex
	submissions map[string]Submission
}

func newMemoryStore() *memoryStore {
	return &memoryStore{
		submissions: make(map[string]Submission),
	}
}

func cloneSubmission(sub Submission) Submission {
	out := sub
	if len(sub.Answers) > 0 {
		out.Answers = make([]Answer, len(sub.Answers))
		copy(out.Answers, sub.Answers)
	}
	return out
}

func sameAttemptScope(a, b AttemptFilter) bool {
	if a.UserID != b.UserID || a.Mode != b.Mode {
		return false
	}
	if a.Mode == ModeContest {
		return a.ContestID != nil && b.ContestID != nil && *a.ContestID == *b.ContestID
	}
	return a.AssessmentID == b.AssessmentID
}

func (m *memoryStore) FindByID(_ context.Context, id string) (Submission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.submissions[id]
	if !ok {
		return Submission{}, NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	return cloneSubmission(sub), nil
}

func (m *memoryStore) FindByIdempotencyKey(_ context.Context, key string) (Submission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, sub := range m.submissions {
		if sub.IdempotencyKey != nil && *sub.IdempotencyKey == key {
			return cloneSubmission(sub), nil
		}
	}
	return Submission{}, NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
}

func (m *memoryStore) CountAttempts(_ context.Context, filter AttemptFilter) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var count int64
	for _, sub := range m.submissions {
		scope := AttemptFilter{
			UserID:       sub.UserID,
			ContestID:    sub.ContestID,
			AssessmentID: sub.AssessmentID,
			Mode:         sub.SubmissionMode,
		}
		if sameAttemptScope(scope, filter) {
			count++
		}
	}
	return count, nil
}

func (m *memoryStore) CreateSubmissionWithAttempt(_ context.Context, sub Submission) (Submission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	targetScope := AttemptFilter{
		UserID:       sub.UserID,
		ContestID:    sub.ContestID,
		AssessmentID: sub.AssessmentID,
		Mode:         sub.SubmissionMode,
	}
	var prior int
	for id, existing := range m.submissions {
		existingScope := AttemptFilter{
			UserID:       existing.UserID,
			ContestID:    existing.ContestID,
			AssessmentID: existing.AssessmentID,
			Mode:         existing.SubmissionMode,
		}
		if sameAttemptScope(existingScope, targetScope) {
			prior++
			if existing.IsFinalAttempt {
				existing.IsFinalAttempt = false
				existing.UpdatedAt = sub.UpdatedAt
				m.submissions[id] = existing
			}
		}
	}
	sub.AttemptNumber = prior + 1
	sub.IsFinalAttempt = true
	m.submissions[sub.ID] = cloneSubmission(sub)
	return cloneSubmission(sub), nil
}

func (m *memoryStore) SaveAutoGradeResult(_ context.Context, submissionID string, outcome AutoGradeOutcome) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.submissions[submissionID]
	if !ok {
		return NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	objScore := outcome.ObjectiveScore
	autoAt := outcome.AutoGradedAt
	sub.Answers = make([]Answer, len(outcome.Answers))
	copy(sub.Answers, outcome.Answers)
	sub.GradingStatus = outcome.GradingStatus
	sub.ObjectiveScore = &objScore
	sub.EssayScore = outcome.EssayScore
	sub.TotalScore = outcome.TotalScore
	sub.MaxScore = outcome.MaxScore
	sub.AutoGradedAt = &autoAt
	sub.FinalGradedAt = outcome.FinalGradedAt
	sub.UpdatedAt = outcome.AutoGradedAt
	m.submissions[submissionID] = sub
	return nil
}

func (m *memoryStore) MarkGradingFailed(_ context.Context, submissionID string, now time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.submissions[submissionID]
	if !ok {
		return NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	sub.GradingStatus = StatusFailed
	sub.UpdatedAt = now
	m.submissions[submissionID] = sub
	return nil
}

func (m *memoryStore) ApplyManualGrades(
	_ context.Context,
	submissionID string,
	updates []ManualGradeUpdate,
	graderID string,
	now time.Time,
) (Submission, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sub, ok := m.submissions[submissionID]
	if !ok {
		return Submission{}, NotFound("SUBMISSION_NOT_FOUND", "Submission not found.")
	}
	byQ := make(map[string]ManualGradeUpdate, len(updates))
	for _, u := range updates {
		byQ[u.QuestionID] = u
	}

	allGraded := true
	var essaySum float64
	for i := range sub.Answers {
		ans := sub.Answers[i]
		if ans.QuestionType == QuestionEssay {
			if upd, matched := byQ[ans.QuestionID]; matched {
				pts := RoundScore(upd.Points)
				gid := graderID
				gradedAt := now
				ans.EarnedPoints = &pts
				ans.GradingStatus = AnswerManuallyGraded
				ans.GraderID = &gid
				ans.GraderFeedback = upd.Feedback
				ans.GradedAt = &gradedAt
				sub.Answers[i] = ans
			}
			if ans.GradingStatus != AnswerManuallyGraded || ans.EarnedPoints == nil {
				allGraded = false
			} else {
				essaySum += *ans.EarnedPoints
			}
		}
	}

	if allGraded {
		essayScore := RoundScore(essaySum)
		var objective float64
		if sub.ObjectiveScore != nil {
			objective = *sub.ObjectiveScore
		}
		total := RoundScore(objective + essayScore)
		finalAt := now
		sub.EssayScore = &essayScore
		sub.TotalScore = &total
		sub.GradingStatus = StatusGraded
		sub.FinalGradedAt = &finalAt
	}
	sub.UpdatedAt = now
	m.submissions[submissionID] = cloneSubmission(sub)
	return cloneSubmission(sub), nil
}

func (m *memoryStore) List(_ context.Context, filter ListFilter) (PaginatedSubmissions, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	matched := make([]Submission, 0)
	for _, sub := range m.submissions {
		if filter.UserID != "" && sub.UserID != filter.UserID {
			continue
		}
		if filter.GroupID != "" && sub.GroupID != filter.GroupID {
			continue
		}
		if filter.ContestID != "" && (sub.ContestID == nil || *sub.ContestID != filter.ContestID) {
			continue
		}
		if filter.AssessmentID != "" && sub.AssessmentID != filter.AssessmentID {
			continue
		}
		if filter.GradingStatus != "" && sub.GradingStatus != filter.GradingStatus {
			continue
		}
		if filter.SubmissionMode != "" && sub.SubmissionMode != filter.SubmissionMode {
			continue
		}
		if filter.FinalOnly && !sub.IsFinalAttempt {
			continue
		}
		summary := cloneSubmission(sub)
		summary.Answers = nil
		matched = append(matched, summary)
	}
	slices.SortFunc(matched, func(a, b Submission) int {
		if a.SubmittedAt.After(b.SubmittedAt) {
			return -1
		}
		if a.SubmittedAt.Before(b.SubmittedAt) {
			return 1
		}
		return 0
	})
	total := int64(len(matched))
	offset := (filter.Page - 1) * filter.Limit
	end := min(offset+filter.Limit, len(matched))
	var pageItems []Submission
	if offset < len(matched) {
		pageItems = matched[offset:end]
	} else {
		pageItems = []Submission{}
	}
	totalPages := 0
	if total > 0 {
		totalPages = int(math.Ceil(float64(total) / float64(filter.Limit)))
	}
	return PaginatedSubmissions{
		Items: pageItems,
		Pagination: PaginationMeta{
			Page:       filter.Page,
			Limit:      filter.Limit,
			Total:      total,
			TotalPages: totalPages,
		},
	}, nil
}

type mockUpstream struct {
	memberships map[string]client.GroupMembership
	assessments map[string]client.AssessmentSummary
	gradingData map[string]client.GradingData
	contests    map[string]client.ContestSubmissionContext
}

func (u *mockUpstream) GetGroupMembership(_ context.Context, groupID, userID string) (client.GroupMembership, error) {
	if item, ok := u.memberships[groupID+":"+userID]; ok {
		return item, nil
	}
	return client.GroupMembership{}, &client.UpstreamError{StatusCode: http.StatusNotFound, Service: "group-service"}
}

func (u *mockUpstream) GetAssessmentSummary(_ context.Context, assessmentID string) (client.AssessmentSummary, error) {
	if item, ok := u.assessments[assessmentID]; ok {
		return item, nil
	}
	return client.AssessmentSummary{}, &client.UpstreamError{StatusCode: http.StatusNotFound, Service: "assessment-service"}
}

func (u *mockUpstream) GetGradingData(_ context.Context, assessmentID string, version int) (client.GradingData, error) {
	if item, ok := u.gradingData[assessmentID]; ok && item.Version == version {
		return item, nil
	}
	return client.GradingData{}, &client.UpstreamError{StatusCode: http.StatusNotFound, Service: "assessment-service"}
}

func (u *mockUpstream) GetContestSubmissionContext(_ context.Context, contestID, userID string) (client.ContestSubmissionContext, error) {
	if item, ok := u.contests[contestID+":"+userID]; ok {
		return item, nil
	}
	return client.ContestSubmissionContext{}, &client.UpstreamError{StatusCode: http.StatusNotFound, Service: "contest-service"}
}

type testHarness struct {
	cfg      config.Config
	store    *memoryStore
	broker   *kafka.LocalBroker
	upstream *mockUpstream
	service  *Service
	handler  http.Handler
	cancel   context.CancelFunc
}

func newTestHarness() *testHarness {
	cfg := config.Config{
		Port:                   8005,
		InternalServiceSecret:  "test-internal-secret-123",
		CORSAllowedOrigins:     []string{"http://localhost:8080"},
		KafkaEnabled:           false,
		KafkaSubmissionTopic:   "submission.submitted.v1",
		KafkaNotificationTopic: "notification.requested.v1",
	}
	store := newMemoryStore()
	broker := kafka.NewLocalBroker()
	upstream := &mockUpstream{
		memberships: make(map[string]client.GroupMembership),
		assessments: make(map[string]client.AssessmentSummary),
		gradingData: make(map[string]client.GradingData),
		contests:    make(map[string]client.ContestSubmissionContext),
	}
	svc := NewService(store, upstream, broker)
	ctx, cancel := context.WithCancel(context.Background())
	broker.StartConsumer(ctx, svc.ProcessSubmittedEvent)

	return &testHarness{
		cfg:      cfg,
		store:    store,
		broker:   broker,
		upstream: upstream,
		service:  svc,
		handler:  NewRouter(cfg, svc),
		cancel:   cancel,
	}
}

func (h *testHarness) close() {
	h.cancel()
	_ = h.broker.Close()
}

func waitForStatus(t *testing.T, h *testHarness, submissionID string, expected GradingStatus) Submission {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		sub, err := h.store.FindByID(context.Background(), submissionID)
		if err == nil && sub.GradingStatus == expected {
			return sub
		}
		time.Sleep(10 * time.Millisecond)
	}
	sub, _ := h.store.FindByID(context.Background(), submissionID)
	t.Fatalf("timed out waiting for status %s, got %s", expected, sub.GradingStatus)
	return Submission{}
}

func TestGORMSchemaMetadataMatchesERD(t *testing.T) {
	subSchema, err := schema.Parse(&Submission{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("parse Submission schema: %v", err)
	}
	if subSchema.Table != "submissions" {
		t.Fatalf("expected table submissions, got %s", subSchema.Table)
	}
	if _, ok := subSchema.FieldsByDBName["idempotency_key"]; !ok {
		t.Fatal("missing idempotency_key column")
	}

	ansSchema, err := schema.Parse(&Answer{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatalf("parse Answer schema: %v", err)
	}
	if ansSchema.Table != "submission_answers" {
		t.Fatalf("expected table submission_answers, got %s", ansSchema.Table)
	}
	if _, ok := ansSchema.FieldsByDBName["expected_answer_snapshot"]; !ok {
		t.Fatal("missing expected_answer_snapshot column")
	}
}

func TestObjectiveAndHybridGrader(t *testing.T) {
	now := time.Now().UTC()
	subID := uuid.NewString()
	keyItems := []client.AnswerKeyItem{
		{
			QuestionID:    "q1",
			QuestionType:  string(QuestionSingleChoice),
			Points:        2.5,
			CorrectAnswer: json.RawMessage(`"B"`),
		},
		{
			QuestionID:    "q2",
			QuestionType:  string(QuestionMultipleChoice),
			Points:        3.0,
			CorrectAnswer: json.RawMessage(`["A","C"]`),
		},
		{
			QuestionID:    "q3",
			QuestionType:  string(QuestionFillInTheBlank),
			Points:        2.0,
			CorrectAnswer: json.RawMessage(`["42","forty-two"]`),
		},
		{
			QuestionID:    "q4",
			QuestionType:  string(QuestionEssay),
			Points:        2.5,
			CorrectAnswer: json.RawMessage(`null`),
		},
	}

	submitted := []Answer{
		{ID: uuid.NewString(), QuestionID: "q1", StudentResponse: JSONB(`" b "`)},
		{ID: uuid.NewString(), QuestionID: "q2", StudentResponse: JSONB(`["c","a"]`)},
		{ID: uuid.NewString(), QuestionID: "q3", StudentResponse: JSONB(`"Forty-Two"`)},
		{ID: uuid.NewString(), QuestionID: "q4", StudentResponse: JSONB(`"Detailed answer"`)},
	}

	hybridOutcome := BuildAutoGradedAnswers(subID, submitted, keyItems, now)
	if hybridOutcome.GradingStatus != StatusPendingManual {
		t.Fatalf("expected PENDING_MANUAL, got %s", hybridOutcome.GradingStatus)
	}
	if hybridOutcome.TotalScore != nil {
		t.Fatal("expected TotalScore to be nil while essay is pending")
	}
	if hybridOutcome.ObjectiveScore != 7.5 || hybridOutcome.MaxScore != 10 {
		t.Fatalf("unexpected scores: obj=%v max=%v", hybridOutcome.ObjectiveScore, hybridOutcome.MaxScore)
	}

	objOutcome := BuildAutoGradedAnswers(subID, submitted[:3], keyItems[:3], now)
	if objOutcome.GradingStatus != StatusGraded {
		t.Fatalf("expected GRADED, got %s", objOutcome.GradingStatus)
	}
	if objOutcome.TotalScore == nil || *objOutcome.TotalScore != 7.5 {
		t.Fatalf("unexpected total score: %v", objOutcome.TotalScore)
	}
}

func TestSecurityMiddlewareAndCORS(t *testing.T) {
	h := newTestHarness()
	defer h.close()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	h.handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on health, got %d", rec.Code)
	}

	preflight := httptest.NewRequest(http.MethodOptions, "/api/v1/internal/submissions/me", nil)
	preflight.Header.Set("Origin", "http://localhost:8080")
	preflightRec := httptest.NewRecorder()
	h.handler.ServeHTTP(preflightRec, preflight)
	if preflightRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on preflight, got %d", preflightRec.Code)
	}
	if preflightRec.Header().Get("Access-Control-Allow-Origin") != "http://localhost:8080" {
		t.Fatalf("missing CORS allow-origin header")
	}

	unauthReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions/me", nil)
	unauthRec := httptest.NewRecorder()
	h.handler.ServeHTTP(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing internal secret, got %d", unauthRec.Code)
	}

	badSecretReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions/me", nil)
	badSecretReq.Header.Set("X-Internal-Secret", "wrong")
	badSecretRec := httptest.NewRecorder()
	h.handler.ServeHTTP(badSecretRec, badSecretReq)
	if badSecretRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for invalid internal secret, got %d", badSecretRec.Code)
	}
}

func TestContestSinglePolicyAsyncGradingAndIdempotency(t *testing.T) {
	h := newTestHarness()
	defer h.close()

	groupID := uuid.NewString()
	contestID := uuid.NewString()
	assessmentID := uuid.NewString()
	studentID := uuid.NewString()

	h.upstream.contests[contestID+":"+studentID] = client.ContestSubmissionContext{
		ContestID:         contestID,
		GroupID:           groupID,
		AssessmentID:      assessmentID,
		AssessmentVersion: 2,
		OrganizerID:       uuid.NewString(),
		Visibility:        "PUBLIC",
		Status:            "PUBLISHED",
		Phase:             "ONGOING",
		SubmissionPolicy:  "SINGLE",
		EvaluationRule:    "SINGLE_ATTEMPT",
		IsGroupMember:     true,
		CanSubmit:         true,
	}
	h.upstream.assessments[assessmentID] = client.AssessmentSummary{
		ID:          assessmentID,
		GroupID:     groupID,
		Version:     2,
		TotalPoints: 5,
		Status:      "ACTIVE",
	}
	h.upstream.gradingData[assessmentID] = client.GradingData{
		AssessmentID: assessmentID,
		GroupID:      groupID,
		Version:      2,
		TotalPoints:  5,
		Answers: []client.AnswerKeyItem{
			{
				QuestionID:    "q1",
				QuestionType:  string(QuestionSingleChoice),
				Points:        5,
				CorrectAnswer: json.RawMessage(`"A"`),
			},
		},
	}

	payload := []byte(`{"submission_mode":"CONTEST","contest_id":"` + contestID + `","answers":[{"question_id":"q1","student_response":"a"}]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	req.Header.Set("X-User-Id", studentID)
	req.Header.Set("X-User-Role", "USER")
	req.Header.Set("Idempotency-Key", "idem-key-1")
	rec := httptest.NewRecorder()
	h.handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d (%s)", rec.Code, rec.Body.String())
	}

	var queued Submission
	if err := json.Unmarshal(rec.Body.Bytes(), &queued); err != nil {
		t.Fatalf("decode submission: %v", err)
	}

	graded := waitForStatus(t, h, queued.ID, StatusGraded)
	if graded.TotalScore == nil || *graded.TotalScore != 5 {
		t.Fatalf("expected total score 5, got %v", graded.TotalScore)
	}

	notifications := h.broker.Notifications()
	if len(notifications) != 1 || notifications[0].Type != "SUBMISSION_GRADED" {
		t.Fatalf("expected 1 SUBMISSION_GRADED notification, got %+v", notifications)
	}

	replayReq := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(payload))
	replayReq.Header.Set("Content-Type", "application/json")
	replayReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	replayReq.Header.Set("X-User-Id", studentID)
	replayReq.Header.Set("X-User-Role", "USER")
	replayReq.Header.Set("Idempotency-Key", "idem-key-1")
	replayRec := httptest.NewRecorder()
	h.handler.ServeHTTP(replayRec, replayReq)
	if replayRec.Code != http.StatusOK {
		t.Fatalf("expected 200 idempotent replay, got %d", replayRec.Code)
	}

	dupReq := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(payload))
	dupReq.Header.Set("Content-Type", "application/json")
	dupReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	dupReq.Header.Set("X-User-Id", studentID)
	dupReq.Header.Set("X-User-Role", "USER")
	dupRec := httptest.NewRecorder()
	h.handler.ServeHTTP(dupRec, dupReq)
	if dupRec.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate SINGLE attempt, got %d", dupRec.Code)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions/"+queued.ID, nil)
	getReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	getReq.Header.Set("X-User-Id", studentID)
	getReq.Header.Set("X-User-Role", "USER")
	getRec := httptest.NewRecorder()
	h.handler.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200 get own submission, got %d", getRec.Code)
	}
	var studentView Submission
	_ = json.Unmarshal(getRec.Body.Bytes(), &studentView)
	if len(studentView.Answers[0].ExpectedAnswerSnapshot) > 0 {
		t.Fatal("expected answer key snapshot to stay hidden in CONTEST student view")
	}
}

func TestMultipleAttemptsHybridManualGradingAndZeroScore(t *testing.T) {
	h := newTestHarness()
	defer h.close()

	groupID := uuid.NewString()
	contestID := uuid.NewString()
	assessmentID := uuid.NewString()
	studentID := uuid.NewString()
	moderatorID := uuid.NewString()

	h.upstream.contests[contestID+":"+studentID] = client.ContestSubmissionContext{
		ContestID:         contestID,
		GroupID:           groupID,
		AssessmentID:      assessmentID,
		AssessmentVersion: 1,
		SubmissionPolicy:  "MULTIPLE",
		EvaluationRule:    "FINAL_ATTEMPT_ONLY",
		IsGroupMember:     true,
		CanSubmit:         true,
	}
	h.upstream.assessments[assessmentID] = client.AssessmentSummary{
		ID:            assessmentID,
		GroupID:       groupID,
		Version:       1,
		HasEssayItems: true,
		TotalPoints:   10,
		Status:        "ACTIVE",
	}
	h.upstream.gradingData[assessmentID] = client.GradingData{
		AssessmentID: assessmentID,
		GroupID:      groupID,
		Version:      1,
		HasEssay:     true,
		TotalPoints:  10,
		Answers: []client.AnswerKeyItem{
			{
				QuestionID:    "q1",
				QuestionType:  string(QuestionSingleChoice),
				Points:        4,
				CorrectAnswer: json.RawMessage(`"A"`),
			},
			{
				QuestionID:    "q2",
				QuestionType:  string(QuestionEssay),
				Points:        6,
				CorrectAnswer: json.RawMessage(`null`),
			},
		},
	}
	h.upstream.memberships[groupID+":"+studentID] = client.GroupMembership{
		GroupID:     groupID,
		UserID:      studentID,
		GroupStatus: "ACTIVE",
		Visibility:  "PRIVATE",
		IsMember:    true,
		CanManage:   false,
	}
	h.upstream.memberships[groupID+":"+moderatorID] = client.GroupMembership{
		GroupID:     groupID,
		UserID:      moderatorID,
		GroupStatus: "ACTIVE",
		Visibility:  "PRIVATE",
		IsMember:    true,
		CanManage:   true,
	}

	attempt1Body := []byte(`{"submission_mode":"CONTEST","contest_id":"` + contestID + `","answers":[{"question_id":"q1","student_response":"B"},{"question_id":"q2","student_response":"First draft"}]}`)
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(attempt1Body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	req1.Header.Set("X-User-Id", studentID)
	req1.Header.Set("X-User-Role", "USER")
	rec1 := httptest.NewRecorder()
	h.handler.ServeHTTP(rec1, req1)
	if rec1.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on attempt 1, got %d", rec1.Code)
	}
	var sub1 Submission
	_ = json.Unmarshal(rec1.Body.Bytes(), &sub1)
	waitForStatus(t, h, sub1.ID, StatusPendingManual)

	attempt2Body := []byte(`{"submission_mode":"CONTEST","contest_id":"` + contestID + `","trigger_type":"AUTO_TIMEOUT","answers":[{"question_id":"q1","student_response":"A"},{"question_id":"q2","student_response":"Final essay"}]}`)
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(attempt2Body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	req2.Header.Set("X-User-Id", studentID)
	req2.Header.Set("X-User-Role", "USER")
	rec2 := httptest.NewRecorder()
	h.handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusAccepted {
		t.Fatalf("expected 202 on attempt 2, got %d", rec2.Code)
	}
	var sub2 Submission
	_ = json.Unmarshal(rec2.Body.Bytes(), &sub2)
	if sub2.AttemptNumber != 2 || !sub2.IsFinalAttempt {
		t.Fatalf("expected attempt 2 as final attempt, got num=%d final=%v", sub2.AttemptNumber, sub2.IsFinalAttempt)
	}
	sub1Reloaded, _ := h.store.FindByID(context.Background(), sub1.ID)
	if sub1Reloaded.IsFinalAttempt {
		t.Fatal("expected attempt 1 is_final_attempt to flip to false")
	}

	pendingSub2 := waitForStatus(t, h, sub2.ID, StatusPendingManual)
	if pendingSub2.TotalScore != nil {
		t.Fatal("expected total_score to remain locked until essay is graded")
	}

	studentGradeReq := httptest.NewRequest(http.MethodPatch, "/api/v1/internal/submissions/"+sub2.ID+"/grade", bytes.NewReader([]byte(`{"grades":[{"question_id":"q2","earned_points":5}]}`)))
	studentGradeReq.Header.Set("Content-Type", "application/json")
	studentGradeReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	studentGradeReq.Header.Set("X-User-Id", studentID)
	studentGradeReq.Header.Set("X-User-Role", "USER")
	studentGradeRec := httptest.NewRecorder()
	h.handler.ServeHTTP(studentGradeRec, studentGradeReq)
	if studentGradeRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when student tries to grade essay, got %d", studentGradeRec.Code)
	}

	missingPointsReq := httptest.NewRequest(http.MethodPatch, "/api/v1/internal/submissions/"+sub2.ID+"/grade", bytes.NewReader([]byte(`{"grades":[{"question_id":"q2"}]}`)))
	missingPointsReq.Header.Set("Content-Type", "application/json")
	missingPointsReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	missingPointsReq.Header.Set("X-User-Id", moderatorID)
	missingPointsReq.Header.Set("X-User-Role", "USER")
	missingPointsRec := httptest.NewRecorder()
	h.handler.ServeHTTP(missingPointsRec, missingPointsReq)
	if missingPointsRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when earned_points is omitted, got %d", missingPointsRec.Code)
	}

	zeroGradeReq := httptest.NewRequest(http.MethodPatch, "/api/v1/internal/submissions/"+sub2.ID+"/grade", bytes.NewReader([]byte(`{"grades":[{"question_id":"q2","earned_points":0,"grader_feedback":"Needs more detail"}]}`)))
	zeroGradeReq.Header.Set("Content-Type", "application/json")
	zeroGradeReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	zeroGradeReq.Header.Set("X-User-Id", moderatorID)
	zeroGradeReq.Header.Set("X-User-Role", "USER")
	zeroGradeRec := httptest.NewRecorder()
	h.handler.ServeHTTP(zeroGradeRec, zeroGradeReq)
	if zeroGradeRec.Code != http.StatusOK {
		t.Fatalf("expected 200 accepting zero points essay grade, got %d (%s)", zeroGradeRec.Code, zeroGradeRec.Body.String())
	}
	var finalized Submission
	_ = json.Unmarshal(zeroGradeRec.Body.Bytes(), &finalized)
	if finalized.GradingStatus != StatusGraded || finalized.TotalScore == nil || *finalized.TotalScore != 4 {
		t.Fatalf("expected GRADED with total_score=4, got status=%s total=%v", finalized.GradingStatus, finalized.TotalScore)
	}

	notifications := h.broker.Notifications()
	if len(notifications) != 1 || notifications[0].ResourceID == nil || *notifications[0].ResourceID != sub2.ID {
		t.Fatalf("expected 1 notification for sub2 after essay grading, got %+v", notifications)
	}
}

func TestPracticeSubmissionAndListingAccess(t *testing.T) {
	h := newTestHarness()
	defer h.close()

	groupID := uuid.NewString()
	assessmentID := uuid.NewString()
	memberID := uuid.NewString()
	outsiderID := uuid.NewString()
	moderatorID := uuid.NewString()

	h.upstream.assessments[assessmentID] = client.AssessmentSummary{
		ID:                assessmentID,
		GroupID:           groupID,
		Version:           1,
		IsPracticeEnabled: true,
		Visibility:        "PRIVATE",
		Status:            "ACTIVE",
		TotalPoints:       10,
	}
	h.upstream.gradingData[assessmentID] = client.GradingData{
		AssessmentID:      assessmentID,
		GroupID:           groupID,
		Version:           1,
		IsPracticeEnabled: true,
		TotalPoints:       10,
		Answers: []client.AnswerKeyItem{
			{
				QuestionID:    "q1",
				QuestionType:  string(QuestionFillInTheBlank),
				Points:        10,
				CorrectAnswer: json.RawMessage(`"quicksort"`),
			},
		},
	}
	h.upstream.memberships[groupID+":"+memberID] = client.GroupMembership{
		GroupID:     groupID,
		UserID:      memberID,
		GroupStatus: "ACTIVE",
		Visibility:  "PRIVATE",
		IsMember:    true,
	}
	h.upstream.memberships[groupID+":"+outsiderID] = client.GroupMembership{
		GroupID:     groupID,
		UserID:      outsiderID,
		GroupStatus: "ACTIVE",
		Visibility:  "PRIVATE",
		IsMember:    false,
	}
	h.upstream.memberships[groupID+":"+moderatorID] = client.GroupMembership{
		GroupID:     groupID,
		UserID:      moderatorID,
		GroupStatus: "ACTIVE",
		Visibility:  "PRIVATE",
		IsMember:    true,
		CanManage:   true,
	}

	body := []byte(`{"submission_mode":"PRACTICE","assessment_id":"` + assessmentID + `","answers":[{"question_id":"q1","student_response":"Quicksort"}]}`)
	outsiderReq := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(body))
	outsiderReq.Header.Set("Content-Type", "application/json")
	outsiderReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	outsiderReq.Header.Set("X-User-Id", outsiderID)
	outsiderReq.Header.Set("X-User-Role", "USER")
	outsiderRec := httptest.NewRecorder()
	h.handler.ServeHTTP(outsiderRec, outsiderReq)
	if outsiderRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for outsider on private practice, got %d", outsiderRec.Code)
	}

	memberReq := httptest.NewRequest(http.MethodPost, "/api/v1/internal/submissions", bytes.NewReader(body))
	memberReq.Header.Set("Content-Type", "application/json")
	memberReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	memberReq.Header.Set("X-User-Id", memberID)
	memberReq.Header.Set("X-User-Role", "USER")
	memberRec := httptest.NewRecorder()
	h.handler.ServeHTTP(memberRec, memberReq)
	if memberRec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 for member practice, got %d", memberRec.Code)
	}
	var practiceSub Submission
	_ = json.Unmarshal(memberRec.Body.Bytes(), &practiceSub)
	waitForStatus(t, h, practiceSub.ID, StatusGraded)

	getPracticeReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions/"+practiceSub.ID, nil)
	getPracticeReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	getPracticeReq.Header.Set("X-User-Id", memberID)
	getPracticeReq.Header.Set("X-User-Role", "USER")
	getPracticeRec := httptest.NewRecorder()
	h.handler.ServeHTTP(getPracticeRec, getPracticeReq)
	if getPracticeRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on practice detail, got %d", getPracticeRec.Code)
	}
	var detail Submission
	_ = json.Unmarshal(getPracticeRec.Body.Bytes(), &detail)
	if string(detail.Answers[0].ExpectedAnswerSnapshot) != `"quicksort"` {
		t.Fatalf("expected practice snapshot revealed after grading, got %s", string(detail.Answers[0].ExpectedAnswerSnapshot))
	}

	listOwnReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions/me?submission_mode=PRACTICE", nil)
	listOwnReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	listOwnReq.Header.Set("X-User-Id", memberID)
	listOwnReq.Header.Set("X-User-Role", "USER")
	listOwnRec := httptest.NewRecorder()
	h.handler.ServeHTTP(listOwnRec, listOwnReq)
	if listOwnRec.Code != http.StatusOK {
		t.Fatalf("expected 200 listing own submissions, got %d", listOwnRec.Code)
	}
	var ownList PaginatedSubmissions
	_ = json.Unmarshal(listOwnRec.Body.Bytes(), &ownList)
	if len(ownList.Items) != 1 || ownList.Items[0].ID != practiceSub.ID {
		t.Fatalf("unexpected own list response: %+v", ownList)
	}

	listGroupReq := httptest.NewRequest(http.MethodGet, "/api/v1/internal/submissions?group_id="+groupID, nil)
	listGroupReq.Header.Set("X-Internal-Secret", h.cfg.InternalServiceSecret)
	listGroupReq.Header.Set("X-User-Id", moderatorID)
	listGroupReq.Header.Set("X-User-Role", "USER")
	listGroupRec := httptest.NewRecorder()
	h.handler.ServeHTTP(listGroupRec, listGroupReq)
	if listGroupRec.Code != http.StatusOK {
		t.Fatalf("expected 200 for moderator group listing, got %d", listGroupRec.Code)
	}
}

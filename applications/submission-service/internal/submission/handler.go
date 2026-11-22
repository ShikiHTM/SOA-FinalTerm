package submission

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"applications/submission-service/internal/config"
	"applications/submission-service/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	service *Service
}

type createAnswerRequest struct {
	QuestionID      string          `json:"question_id" binding:"required,min=1,max=100"`
	QuestionType    QuestionType    `json:"question_type"`
	StudentResponse json.RawMessage `json:"student_response" binding:"required"`
}

type createSubmissionRequest struct {
	SubmissionMode Mode                  `json:"submission_mode" binding:"required"`
	TriggerType    TriggerType           `json:"trigger_type"`
	ContestID      *string               `json:"contest_id"`
	AssessmentID   *string               `json:"assessment_id"`
	Answers        []createAnswerRequest `json:"answers" binding:"required,min=1,max=200,dive"`
}

type manualGradeItemRequest struct {
	QuestionID     string   `json:"question_id" binding:"required,min=1,max=100"`
	EarnedPoints   *float64 `json:"earned_points" binding:"required"`
	GraderFeedback *string  `json:"grader_feedback"`
}

type gradeEssaysRequest struct {
	Grades []manualGradeItemRequest `json:"grades" binding:"required,min=1,max=50,dive"`
}

func NewRouter(cfg config.Config, svc *Service) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.CORS(cfg.CORSAllowedOrigins))

	handler := &Handler{service: svc}

	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok", "service": "submission-service"})
	})

	internal := router.Group("/api/v1/internal")
	internal.Use(middleware.RequireInternalSecret(cfg.InternalServiceSecret))

	submissions := internal.Group("/submissions")
	submissions.Use(middleware.RequireAuthenticatedHeaders())
	{
		submissions.POST("", handler.create)
		submissions.GET("/me", handler.listOwn)
		submissions.GET("", handler.listGroup)
		submissions.GET("/:id", handler.getByID)
		submissions.PATCH("/:id/grade", handler.gradeEssays)
	}

	router.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error_code": "NOT_FOUND",
			"message":    "Route not found.",
		})
	})

	return router
}

func writeError(c *gin.Context, err error) {
	var appErr *AppError
	if errors.As(err, &appErr) {
		body := gin.H{
			"error_code": appErr.ErrorCode,
			"message":    appErr.Message,
		}
		if len(appErr.Details) > 0 {
			body["details"] = appErr.Details
		}
		c.JSON(appErr.StatusCode, body)
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{
		"error_code": "INTERNAL_ERROR",
		"message":    "An unexpected internal error occurred.",
	})
}

func isValidQuestionType(qType QuestionType) bool {
	return qType == QuestionSingleChoice ||
		qType == QuestionMultipleChoice ||
		qType == QuestionFillInTheBlank ||
		qType == QuestionEssay
}

func isValidGradingStatus(status GradingStatus) bool {
	return status == StatusQueued ||
		status == StatusAutoGraded ||
		status == StatusPendingManual ||
		status == StatusGraded ||
		status == StatusFailed
}

func parseListQuery(c *gin.Context, requireGroup bool) (ListFilter, error) {
	page := 1
	if rawPage := strings.TrimSpace(c.Query("page")); rawPage != "" {
		parsed, err := strconv.Atoi(rawPage)
		if err != nil || parsed < 1 {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "page must be a positive integer.")
		}
		page = parsed
	}

	limit := 20
	if rawLimit := strings.TrimSpace(c.Query("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed < 1 || parsed > 100 {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "limit must be between 1 and 100.")
		}
		limit = parsed
	}

	groupID := strings.TrimSpace(c.Query("group_id"))
	if requireGroup && groupID == "" {
		return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "group_id is required.")
	}
	if groupID != "" {
		if _, err := uuid.Parse(groupID); err != nil {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "group_id must be a valid UUID.")
		}
	}

	contestID := strings.TrimSpace(c.Query("contest_id"))
	if contestID != "" {
		if _, err := uuid.Parse(contestID); err != nil {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "contest_id must be a valid UUID.")
		}
	}

	assessmentID := strings.TrimSpace(c.Query("assessment_id"))
	if assessmentID != "" {
		if _, err := uuid.Parse(assessmentID); err != nil {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "assessment_id must be a valid UUID.")
		}
	}

	var status GradingStatus
	if rawStatus := strings.TrimSpace(c.Query("grading_status")); rawStatus != "" {
		candidate := GradingStatus(rawStatus)
		if !isValidGradingStatus(candidate) {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Invalid grading_status.")
		}
		status = candidate
	}

	var mode Mode
	if rawMode := strings.TrimSpace(c.Query("submission_mode")); rawMode != "" {
		candidate := Mode(rawMode)
		if candidate != ModeContest && candidate != ModePractice {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Invalid submission_mode.")
		}
		mode = candidate
	}

	finalOnly := false
	if rawFinal := strings.TrimSpace(c.Query("is_final_attempt")); rawFinal != "" {
		if rawFinal != "true" && rawFinal != "false" {
			return ListFilter{}, BadRequest("VALIDATION_ERROR", "Request validation failed.", "is_final_attempt must be true or false.")
		}
		finalOnly = rawFinal == "true"
	}

	return ListFilter{
		GroupID:        groupID,
		ContestID:      contestID,
		AssessmentID:   assessmentID,
		GradingStatus:  status,
		SubmissionMode: mode,
		FinalOnly:      finalOnly,
		Page:           page,
		Limit:          limit,
	}, nil
}

func (h *Handler) create(c *gin.Context) {
	var req createSubmissionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", err.Error()))
		return
	}

	if req.SubmissionMode != ModeContest && req.SubmissionMode != ModePractice {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "submission_mode must be CONTEST or PRACTICE."))
		return
	}
	if req.TriggerType == "" {
		req.TriggerType = TriggerManual
	}
	if req.TriggerType != TriggerManual && req.TriggerType != TriggerAutoTimeout {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "trigger_type must be MANUAL or AUTO_TIMEOUT."))
		return
	}
	if req.ContestID != nil && *req.ContestID != "" {
		if _, err := uuid.Parse(*req.ContestID); err != nil {
			writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "contest_id must be a valid UUID."))
			return
		}
	}
	if req.AssessmentID != nil && *req.AssessmentID != "" {
		if _, err := uuid.Parse(*req.AssessmentID); err != nil {
			writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "assessment_id must be a valid UUID."))
			return
		}
	}

	idempotencyKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if len(idempotencyKey) > 128 {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Idempotency-Key must not exceed 128 characters."))
		return
	}

	answers := make([]SubmittedAnswerInput, 0, len(req.Answers))
	for _, ans := range req.Answers {
		if ans.QuestionType != "" && !isValidQuestionType(ans.QuestionType) {
			writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Invalid question_type in answers."))
			return
		}
		answers = append(answers, SubmittedAnswerInput{
			QuestionID:      strings.TrimSpace(ans.QuestionID),
			QuestionType:    ans.QuestionType,
			StudentResponse: JSONB(ans.StudentResponse),
		})
	}

	actorID := c.GetString(middleware.ContextKeyActorID)
	result, err := h.service.Create(c.Request.Context(), actorID, idempotencyKey, CreateSubmissionInput{
		SubmissionMode: req.SubmissionMode,
		TriggerType:    req.TriggerType,
		ContestID:      req.ContestID,
		AssessmentID:   req.AssessmentID,
		Answers:        answers,
	})
	if err != nil {
		writeError(c, err)
		return
	}

	statusCode := http.StatusAccepted
	if result.Replayed {
		statusCode = http.StatusOK
	}
	c.JSON(statusCode, result.Submission)
}

func (h *Handler) listOwn(c *gin.Context) {
	filter, err := parseListQuery(c, false)
	if err != nil {
		writeError(c, err)
		return
	}
	actorID := c.GetString(middleware.ContextKeyActorID)
	result, err := h.service.ListOwn(c.Request.Context(), actorID, filter)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) listGroup(c *gin.Context) {
	filter, err := parseListQuery(c, true)
	if err != nil {
		writeError(c, err)
		return
	}
	actorID := c.GetString(middleware.ContextKeyActorID)
	actorRole := c.GetString(middleware.ContextKeyActorRole)
	result, err := h.service.ListForGroup(c.Request.Context(), actorID, actorRole, filter)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) getByID(c *gin.Context) {
	submissionID := c.Param("id")
	if _, err := uuid.Parse(submissionID); err != nil {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Submission ID must be a valid UUID."))
		return
	}
	actorID := c.GetString(middleware.ContextKeyActorID)
	actorRole := c.GetString(middleware.ContextKeyActorRole)
	result, err := h.service.GetByID(c.Request.Context(), actorID, actorRole, submissionID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) gradeEssays(c *gin.Context) {
	submissionID := c.Param("id")
	if _, err := uuid.Parse(submissionID); err != nil {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "Submission ID must be a valid UUID."))
		return
	}

	var req gradeEssaysRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", err.Error()))
		return
	}

	updates := make([]ManualGradeUpdate, 0, len(req.Grades))
	for _, g := range req.Grades {
		var feedback *string
		if g.GraderFeedback != nil {
			trimmed := strings.TrimSpace(*g.GraderFeedback)
			if len(trimmed) > 4000 {
				writeError(c, BadRequest("VALIDATION_ERROR", "Request validation failed.", "grader_feedback must not exceed 4000 characters."))
				return
			}
			feedback = &trimmed
		}
		updates = append(updates, ManualGradeUpdate{
			QuestionID: strings.TrimSpace(g.QuestionID),
			Points:     *g.EarnedPoints,
			Feedback:   feedback,
		})
	}

	actorID := c.GetString(middleware.ContextKeyActorID)
	actorRole := c.GetString(middleware.ContextKeyActorRole)
	result, err := h.service.GradeEssays(c.Request.Context(), actorID, actorRole, submissionID, updates)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

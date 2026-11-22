package submission

import (
	"encoding/json"
	"math"
	"slices"
	"strings"
	"time"

	"applications/submission-service/internal/client"

	"github.com/google/uuid"
)

type AutoGradeOutcome struct {
	Answers         []Answer
	ObjectiveScore  float64
	EssayScore      *float64
	TotalScore      *float64
	MaxScore        float64
	HasPendingEssay bool
	GradingStatus   GradingStatus
	AutoGradedAt    time.Time
	FinalGradedAt   *time.Time
}

func RoundScore(value float64) float64 {
	return math.Round(value*100) / 100
}

func extractNormalizedStrings(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		trimmed := strings.ToLower(strings.TrimSpace(single))
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	}
	var multi []string
	if err := json.Unmarshal(raw, &multi); err == nil {
		seen := make(map[string]struct{}, len(multi))
		out := make([]string, 0, len(multi))
		for _, item := range multi {
			trimmed := strings.ToLower(strings.TrimSpace(item))
			if trimmed == "" {
				continue
			}
			if _, ok := seen[trimmed]; !ok {
				seen[trimmed] = struct{}{}
				out = append(out, trimmed)
			}
		}
		slices.Sort(out)
		return out
	}
	return nil
}

func extractSingleNormalizedString(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", false
	}
	var single string
	if err := json.Unmarshal(raw, &single); err != nil {
		return "", false
	}
	trimmed := strings.ToLower(strings.TrimSpace(single))
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
}

func EvaluateObjective(
	qType QuestionType,
	studentRaw JSONB,
	expectedRaw json.RawMessage,
	maxPoints float64,
) (float64, bool) {
	studentMsg := json.RawMessage(studentRaw)
	switch qType {
	case QuestionSingleChoice:
		studentAns, okStudent := extractSingleNormalizedString(studentMsg)
		expectedAns, okExpected := extractSingleNormalizedString(expectedRaw)
		if okStudent && okExpected && studentAns == expectedAns {
			return RoundScore(maxPoints), true
		}
		return 0, false
	case QuestionMultipleChoice:
		studentSet := extractNormalizedStrings(studentMsg)
		expectedSet := extractNormalizedStrings(expectedRaw)
		if len(expectedSet) > 0 && slices.Equal(studentSet, expectedSet) {
			return RoundScore(maxPoints), true
		}
		return 0, false
	case QuestionFillInTheBlank:
		studentAns, okStudent := extractSingleNormalizedString(studentMsg)
		accepted := extractNormalizedStrings(expectedRaw)
		if okStudent && slices.Contains(accepted, studentAns) {
			return RoundScore(maxPoints), true
		}
		return 0, false
	default:
		return 0, false
	}
}

func BuildAutoGradedAnswers(
	submissionID string,
	submitted []Answer,
	keyItems []client.AnswerKeyItem,
	now time.Time,
) AutoGradeOutcome {
	byQuestionID := make(map[string]Answer, len(submitted))
	for _, ans := range submitted {
		byQuestionID[ans.QuestionID] = ans
	}

	gradedAnswers := make([]Answer, 0, len(keyItems))
	var objectiveScore float64
	var maxScore float64
	hasPendingEssay := false

	for _, item := range keyItems {
		qType := QuestionType(item.QuestionType)
		maxScore += item.Points

		studentResponse := JSONB("null")
		answerID := uuid.NewString()
		if existing, ok := byQuestionID[item.QuestionID]; ok {
			if len(existing.StudentResponse) > 0 {
				studentResponse = existing.StudentResponse
			}
			if existing.ID != "" {
				answerID = existing.ID
			}
		}

		var expectedSnapshot JSONB
		if len(item.CorrectAnswer) > 0 && string(item.CorrectAnswer) != "null" {
			expectedSnapshot = JSONB(slices.Clone(item.CorrectAnswer))
		}

		record := Answer{
			ID:                     answerID,
			SubmissionID:           submissionID,
			QuestionID:             item.QuestionID,
			QuestionType:           qType,
			StudentResponse:        studentResponse,
			ExpectedAnswerSnapshot: expectedSnapshot,
			MaxPoints:              RoundScore(item.Points),
		}

		if qType == QuestionEssay {
			hasPendingEssay = true
			record.GradingStatus = AnswerPending
		} else {
			earned, correct := EvaluateObjective(qType, studentResponse, item.CorrectAnswer, item.Points)
			earnedCopy := earned
			correctCopy := correct
			gradedAt := now
			record.EarnedPoints = &earnedCopy
			record.IsCorrect = &correctCopy
			record.GradingStatus = AnswerAutoGraded
			record.GradedAt = &gradedAt
			objectiveScore += earned
		}

		gradedAnswers = append(gradedAnswers, record)
	}

	roundedObjective := RoundScore(objectiveScore)
	roundedMax := RoundScore(maxScore)

	outcome := AutoGradeOutcome{
		Answers:         gradedAnswers,
		ObjectiveScore:  roundedObjective,
		MaxScore:        roundedMax,
		HasPendingEssay: hasPendingEssay,
		AutoGradedAt:    now,
	}

	if hasPendingEssay {
		outcome.GradingStatus = StatusPendingManual
	} else {
		total := roundedObjective
		finalAt := now
		outcome.GradingStatus = StatusGraded
		outcome.TotalScore = &total
		outcome.FinalGradedAt = &finalAt
	}

	return outcome
}

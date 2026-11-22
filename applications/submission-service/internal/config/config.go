package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                   int
	DBHost                 string
	DBPort                 int
	DBUser                 string
	DBPassword             string
	DBName                 string
	DBSSLMode              string
	DBSyncSchema           bool
	InternalServiceSecret  string
	GroupServiceURL        string
	AssessmentServiceURL   string
	ContestServiceURL      string
	KafkaEnabled           bool
	KafkaBrokers           []string
	KafkaSubmissionTopic   string
	KafkaNotificationTopic string
	KafkaConsumerGroup     string
	CORSAllowedOrigins     []string
}

const (
	defaultPort                   = 8005
	defaultDBPort                 = 5432
	defaultGroupServiceURL        = "http://localhost:8002"
	defaultAssessmentServiceURL   = "http://localhost:8003"
	defaultContestServiceURL      = "http://localhost:8004"
	defaultKafkaBrokers           = "localhost:9092"
	defaultKafkaSubmissionTopic   = "submission.submitted.v1"
	defaultKafkaNotificationTopic = "notification.requested.v1"
	defaultKafkaConsumerGroup     = "submission-service"
	defaultCORSAllowedOrigins     = "http://localhost:8080,http://127.0.0.1:8080"
)

func envString(key, fallback string) string {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	return val
}

func envInt(key string, fallback int) int {
	val := strings.TrimSpace(os.Getenv(key))
	if val == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(val)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envBool(key string) bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv(key)), "true")
}

func envCSV(key, fallback string) []string {
	raw := envString(key, fallback)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func Load() Config {
	return Config{
		Port:                   envInt("PORT", defaultPort),
		DBHost:                 envString("SUBMISSION_DB_HOST", "localhost"),
		DBPort:                 envInt("SUBMISSION_DB_PORT", defaultDBPort),
		DBUser:                 envString("SUBMISSION_DB_USER", "submission_service"),
		DBPassword:             envString("SUBMISSION_DB_PASSWORD", "submission_service_dev"),
		DBName:                 envString("SUBMISSION_DB_NAME", "submission_db"),
		DBSSLMode:              envString("SUBMISSION_DB_SSLMODE", "disable"),
		DBSyncSchema:           envBool("SUBMISSION_DB_SYNC_SCHEMA"),
		InternalServiceSecret:  strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_SECRET")),
		GroupServiceURL:        strings.TrimRight(envString("GROUP_SERVICE_URL", defaultGroupServiceURL), "/"),
		AssessmentServiceURL:   strings.TrimRight(envString("ASSESSMENT_SERVICE_URL", defaultAssessmentServiceURL), "/"),
		ContestServiceURL:      strings.TrimRight(envString("CONTEST_SERVICE_URL", defaultContestServiceURL), "/"),
		KafkaEnabled:           envBool("KAFKA_ENABLED"),
		KafkaBrokers:           envCSV("KAFKA_BROKERS", defaultKafkaBrokers),
		KafkaSubmissionTopic:   envString("KAFKA_SUBMISSION_TOPIC", defaultKafkaSubmissionTopic),
		KafkaNotificationTopic: envString("KAFKA_NOTIFICATION_TOPIC", defaultKafkaNotificationTopic),
		KafkaConsumerGroup:     envString("KAFKA_CONSUMER_GROUP", defaultKafkaConsumerGroup),
		CORSAllowedOrigins:     envCSV("CORS_ALLOWED_ORIGINS", defaultCORSAllowedOrigins),
	}
}

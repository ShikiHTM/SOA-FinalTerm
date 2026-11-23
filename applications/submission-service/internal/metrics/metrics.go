package metrics

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var httpDurationBuckets = []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}
var scoreRatioBuckets = []float64{0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0}

var Registry = prometheus.NewRegistry()

var (
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "http_requests_total",
			Help:        "Total number of HTTP requests handled by the service.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"method", "route", "status_class"},
	)

	HTTPRequestDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:        "http_request_duration_seconds",
			Help:        "HTTP request duration in seconds.",
			Buckets:     httpDurationBuckets,
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"method", "route"},
	)

	HTTPRequestsInFlight = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name:        "http_requests_in_flight",
			Help:        "Number of HTTP requests currently in progress.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
	)

	KafkaMessagesPublishedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "kafka_messages_published_total",
			Help:        "Total number of Kafka messages published by the service.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"topic", "result"},
	)

	KafkaMessagesConsumedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "kafka_messages_consumed_total",
			Help:        "Total number of Kafka messages consumed by the service.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"topic", "result"},
	)

	KafkaMessageProcessingDurationSeconds = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:        "kafka_message_processing_duration_seconds",
			Help:        "Kafka message processing duration in seconds.",
			Buckets:     httpDurationBuckets,
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"topic"},
	)

	SubmissionsCreatedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "lms_submissions_created_total",
			Help:        "Total number of submissions created by mode and trigger type.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"mode", "trigger_type"},
	)

	GradingCompletedTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name:        "lms_grading_completed_total",
			Help:        "Total number of completed grading transitions by stage and status.",
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"stage", "status"},
	)

	SubmissionScoreRatio = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:        "lms_submission_score_ratio",
			Help:        "Distribution of final submission score ratio (total_score / max_score).",
			Buckets:     scoreRatioBuckets,
			ConstLabels: prometheus.Labels{"service": "submission-service"},
		},
		[]string{"mode"},
	)
)

func init() {
	runtimeReg := prometheus.WrapRegistererWith(prometheus.Labels{"service": "submission-service"}, Registry)
	runtimeReg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	Registry.MustRegister(
		HTTPRequestsTotal,
		HTTPRequestDurationSeconds,
		HTTPRequestsInFlight,
		KafkaMessagesPublishedTotal,
		KafkaMessagesConsumedTotal,
		KafkaMessageProcessingDurationSeconds,
		SubmissionsCreatedTotal,
		GradingCompletedTotal,
		SubmissionScoreRatio,
	)
}

func toStatusClass(status int) string {
	if status < 100 {
		return "unknown"
	}
	return strconv.Itoa(status/100) + "xx"
}

func GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/metrics" || path == "/health" {
			c.Next()
			return
		}

		HTTPRequestsInFlight.Inc()
		start := time.Now()
		defer func() {
			HTTPRequestsInFlight.Dec()
			status := c.Writer.Status()
			route := c.FullPath()
			if status == http.StatusNotFound || route == "" {
				route = "unmatched"
			}
			method := c.Request.Method
			HTTPRequestDurationSeconds.WithLabelValues(method, route).Observe(time.Since(start).Seconds())
			HTTPRequestsTotal.WithLabelValues(method, route, toStatusClass(status)).Inc()
		}()

		c.Next()
	}
}

func Handler() gin.HandlerFunc {
	h := promhttp.HandlerFor(Registry, promhttp.HandlerOpts{})
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}

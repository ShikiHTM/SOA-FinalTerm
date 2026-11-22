package middleware

import (
	"crypto/subtle"
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	ContextKeyActorID   = "actorID"
	ContextKeyActorRole = "actorRole"
)

func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowAll := slices.Contains(allowedOrigins, "*")
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowAll {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if origin != "" && slices.Contains(allowedOrigins, origin) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization, X-Internal-Secret, X-User-Id, X-User-Role, Idempotency-Key",
		)
		c.Header("Access-Control-Max-Age", "600")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func RequireInternalSecret(expected string) gin.HandlerFunc {
	return func(c *gin.Context) {
		provided := c.GetHeader("X-Internal-Secret")
		if provided == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error_code": "MISSING_INTERNAL_SECRET",
				"message":    "X-Internal-Secret header is required.",
			})
			return
		}
		if expected == "" || subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error_code": "INVALID_INTERNAL_SECRET",
				"message":    "Invalid X-Internal-Secret header.",
			})
			return
		}
		c.Next()
	}
}

func RequireAuthenticatedHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		rawUserID := strings.TrimSpace(c.GetHeader("X-User-Id"))
		rawUserRole := strings.TrimSpace(c.GetHeader("X-User-Role"))
		if _, err := uuid.Parse(rawUserID); err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error_code": "UNAUTHORIZED",
				"message":    "Valid X-User-Id and X-User-Role headers are required.",
			})
			return
		}
		if rawUserRole != "USER" && rawUserRole != "ADMIN" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error_code": "UNAUTHORIZED",
				"message":    "Valid X-User-Id and X-User-Role headers are required.",
			})
			return
		}
		c.Set(ContextKeyActorID, rawUserID)
		c.Set(ContextKeyActorRole, rawUserRole)
		c.Next()
	}
}

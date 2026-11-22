FROM golang:1.26-alpine AS builder

WORKDIR /workspace/applications/submission-service

COPY applications/submission-service/go.mod applications/submission-service/go.sum ./
RUN go mod download

COPY applications/submission-service ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/submission-service ./cmd/server

FROM alpine:3.21 AS runner

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /out/submission-service /app/submission-service

EXPOSE 8005
CMD ["/app/submission-service"]

package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"applications/submission-service/internal/config"
	kafkago "github.com/segmentio/kafka-go"
)

type SubmissionSubmittedEvent struct {
	EventID      string    `json:"event_id"`
	SubmissionID string    `json:"submission_id"`
	SubmittedAt  time.Time `json:"submitted_at"`
}

type NotificationEvent struct {
	EventID         string  `json:"event_id"`
	RecipientUserID string  `json:"recipient_user_id"`
	Type            string  `json:"type"`
	Title           string  `json:"title"`
	Body            string  `json:"body"`
	ResourceType    *string `json:"resource_type,omitempty"`
	ResourceID      *string `json:"resource_id,omitempty"`
}

type Broker interface {
	PublishSubmission(ctx context.Context, event SubmissionSubmittedEvent) error
	PublishNotification(ctx context.Context, event NotificationEvent) error
	StartConsumer(ctx context.Context, handler func(context.Context, SubmissionSubmittedEvent) error)
	Close() error
}

type KafkaBroker struct {
	submissionWriter   *kafkago.Writer
	notificationWriter *kafkago.Writer
	submissionReader   *kafkago.Reader
}

func NewBroker(cfg config.Config) Broker {
	if !cfg.KafkaEnabled {
		return NewLocalBroker()
	}
	return &KafkaBroker{
		submissionWriter: &kafkago.Writer{
			Addr:                   kafkago.TCP(cfg.KafkaBrokers...),
			Topic:                  cfg.KafkaSubmissionTopic,
			Balancer:               &kafkago.LeastBytes{},
			AllowAutoTopicCreation: true,
		},
		notificationWriter: &kafkago.Writer{
			Addr:                   kafkago.TCP(cfg.KafkaBrokers...),
			Topic:                  cfg.KafkaNotificationTopic,
			Balancer:               &kafkago.LeastBytes{},
			AllowAutoTopicCreation: true,
		},
		submissionReader: kafkago.NewReader(kafkago.ReaderConfig{
			Brokers:  cfg.KafkaBrokers,
			GroupID:  cfg.KafkaConsumerGroup,
			Topic:    cfg.KafkaSubmissionTopic,
			MinBytes: 1,
			MaxBytes: 10e6,
		}),
	}
}

func publishJSON(ctx context.Context, writer *kafkago.Writer, key string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal kafka message: %w", err)
	}
	return writer.WriteMessages(ctx, kafkago.Message{
		Key:   []byte(key),
		Value: raw,
		Time:  time.Now().UTC(),
	})
}

func (b *KafkaBroker) PublishSubmission(ctx context.Context, event SubmissionSubmittedEvent) error {
	return publishJSON(ctx, b.submissionWriter, event.SubmissionID, event)
}

func (b *KafkaBroker) PublishNotification(ctx context.Context, event NotificationEvent) error {
	return publishJSON(ctx, b.notificationWriter, event.RecipientUserID, event)
}

func (b *KafkaBroker) StartConsumer(
	ctx context.Context,
	handler func(context.Context, SubmissionSubmittedEvent) error,
) {
	go func() {
		for {
			msg, err := b.submissionReader.FetchMessage(ctx)
			if err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				slog.Error("fetch kafka submission message", "error", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
					continue
				}
			}

			var event SubmissionSubmittedEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				slog.Error("invalid submission event payload", "error", err)
				if commitErr := b.submissionReader.CommitMessages(ctx, msg); commitErr != nil {
					slog.Error("commit invalid submission message", "error", commitErr)
				}
				continue
			}

			if err := handler(ctx, event); err != nil {
				slog.Error("process submission event failed", "submission_id", event.SubmissionID, "error", err)
				select {
				case <-ctx.Done():
					return
				case <-time.After(time.Second):
					continue
				}
			}

			if err := b.submissionReader.CommitMessages(ctx, msg); err != nil {
				slog.Error("commit submission message", "submission_id", event.SubmissionID, "error", err)
			}
		}
	}()
}

func (b *KafkaBroker) Close() error {
	var errs []error
	if b.submissionReader != nil {
		if err := b.submissionReader.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if b.submissionWriter != nil {
		if err := b.submissionWriter.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if b.notificationWriter != nil {
		if err := b.notificationWriter.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

type LocalBroker struct {
	queue         chan SubmissionSubmittedEvent
	mu            sync.Mutex
	notifications []NotificationEvent
	closed        bool
}

const localQueueCapacity = 256

func NewLocalBroker() *LocalBroker {
	return &LocalBroker{
		queue: make(chan SubmissionSubmittedEvent, localQueueCapacity),
	}
}

func (b *LocalBroker) PublishSubmission(ctx context.Context, event SubmissionSubmittedEvent) error {
	b.mu.Lock()
	closed := b.closed
	b.mu.Unlock()
	if closed {
		return errors.New("local broker is closed")
	}
	select {
	case b.queue <- event:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (b *LocalBroker) PublishNotification(_ context.Context, event NotificationEvent) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.notifications = append(b.notifications, event)
	return nil
}

func (b *LocalBroker) Notifications() []NotificationEvent {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]NotificationEvent, len(b.notifications))
	copy(out, b.notifications)
	return out
}

func (b *LocalBroker) StartConsumer(
	ctx context.Context,
	handler func(context.Context, SubmissionSubmittedEvent) error,
) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-b.queue:
				if !ok {
					return
				}
				if err := handler(ctx, event); err != nil {
					slog.Error("local submission worker error", "submission_id", event.SubmissionID, "error", err)
				}
			}
		}
	}()
}

func (b *LocalBroker) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.closed {
		b.closed = true
		close(b.queue)
	}
	return nil
}

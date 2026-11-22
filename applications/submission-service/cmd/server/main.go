package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"applications/submission-service/internal/client"
	"applications/submission-service/internal/config"
	"applications/submission-service/internal/database"
	"applications/submission-service/internal/kafka"
	"applications/submission-service/internal/submission"
)

const shutdownTimeout = 10 * time.Second

func main() {
	cfg := config.Load()

	db, err := database.Open(cfg)
	if err != nil {
		slog.Error("database initialization failed", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if cfg.DBSyncSchema {
		if err := database.SyncSchema(ctx, db); err != nil {
			slog.Error("database schema synchronization failed", "error", err)
			os.Exit(1)
		}
	}

	store := submission.NewGormStore(db)
	upstream := client.NewHTTPClients(cfg)
	broker := kafka.NewBroker(cfg)
	svc := submission.NewService(store, upstream, broker)

	broker.StartConsumer(ctx, svc.ProcessSubmittedEvent)

	router := submission.NewRouter(cfg, svc)
	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("submission-service listening", "port", cfg.Port, "kafka_enabled", cfg.KafkaEnabled)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server stopped unexpectedly", "error", err)
			stop()
		}
	}()

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("http server shutdown error", "error", err)
	}
	if err := broker.Close(); err != nil {
		slog.Error("broker close error", "error", err)
	}
	if sqlDB, err := db.DB(); err == nil {
		if closeErr := sqlDB.Close(); closeErr != nil {
			slog.Error("database close error", "error", closeErr)
		}
	}
}

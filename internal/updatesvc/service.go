// Package updatesvc serves native Telegram client update metadata and
// immutable, range-enabled desktop update packages. It is shared by the
// standalone telesrv-update command and the merged telesrv process.
package updatesvc

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"go.uber.org/zap"

	"telesrv/internal/updatecdn"
)

// Config describes one update HTTP endpoint.
type Config struct {
	ListenAddr   string
	ManifestPath string
	FilesDir     string
	APKDir       string
}

// ConfigFromEnv reads the same environment keys the standalone command has
// always used.
func ConfigFromEnv() Config {
	return Config{
		ListenAddr:   envOr("TELESRV_UPDATE_LISTEN", "127.0.0.1:2402"),
		ManifestPath: envOr("TELESRV_UPDATE_MANIFEST", "data/updates/manifest.json"),
		FilesDir:     envOr("TELESRV_UPDATE_FILES_DIR", "data/updates/files"),
		APKDir:       envOr("TELESRV_UPDATE_APK_DIR", "data/updates/apk"),
	}
}

// Validate loads the catalog without starting a listener.
func (c Config) Validate() error {
	_, err := updatecdn.NewStore(c.ManifestPath, c.FilesDir)
	return err
}

// Start runs the update HTTP server until ctx is cancelled.
func Start(ctx context.Context, cfg Config, logger *zap.Logger) error {
	store, err := updatecdn.NewStore(cfg.ManifestPath, cfg.FilesDir)
	if err != nil {
		return fmt.Errorf("load update catalog: %w", err)
	}
	handler, err := updatecdn.NewHandler(store)
	if err != nil {
		return err
	}
	handler.SetAppDir(cfg.APKDir)

	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", cfg.ListenAddr, err)
	}
	if logger == nil {
		logger = zap.NewNop()
	}

	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    32 << 10,
	}
	serveErr := make(chan error, 1)
	go func() {
		serveErr <- server.Serve(listener)
	}()
	logger.Info("update service started",
		zap.String("listen", listener.Addr().String()),
		zap.String("manifest", cfg.ManifestPath),
		zap.String("files", cfg.FilesDir),
		zap.String("apk", cfg.APKDir))

	select {
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve HTTP: %w", err)
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown HTTP server: %w", err)
	}
	if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP: %w", err)
	}
	logger.Info("update service stopped")
	return nil
}

func envOr(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

// Command telesrv-update serves native Telegram client update metadata and
// immutable, range-enabled desktop update packages. The merged telesrv
// process runs the same implementation in-process; this command remains for
// standalone deployments.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"

	"telesrv/internal/updatesvc"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "telesrv-update:", err)
		os.Exit(1)
	}
}

func run() error {
	defaults := updatesvc.ConfigFromEnv()
	listenAddr := flag.String("listen", defaults.ListenAddr, "HTTP listen address")
	manifestPath := flag.String("manifest", defaults.ManifestPath, "release manifest path")
	filesDir := flag.String("files", defaults.FilesDir, "desktop update package directory")
	apkDir := flag.String("apk", defaults.APKDir, "mobile application package directory served under /apk/")
	check := flag.Bool("check", false, "validate the catalog and exit")
	flag.Parse()

	cfg := updatesvc.Config{
		ListenAddr:   *listenAddr,
		ManifestPath: *manifestPath,
		FilesDir:     *filesDir,
		APKDir:       *apkDir,
	}
	if *check {
		if err := cfg.Validate(); err != nil {
			return fmt.Errorf("load update catalog: %w", err)
		}
		fmt.Println("update catalog is valid")
		return nil
	}

	logger, err := zap.NewProduction()
	if err != nil {
		return fmt.Errorf("initialize logger: %w", err)
	}
	defer logger.Sync() //nolint:errcheck

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return updatesvc.Start(ctx, cfg, logger)
}

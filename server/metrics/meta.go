package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var metaRedisLabels = []string{"error_type"}

var (
	metaRedisErrors *prometheus.CounterVec
)

func initMetaRedis() {
	metaRedisErrors = promauto.NewCounterVec(prometheus.CounterOpts{
		Namespace: "eventnative",
		Subsystem: "meta",
		Name:      "redis",
	}, metaRedisLabels)
}

func MetaRedisErrors(errorType string) {
	if Enabled {
		metaRedisErrors.WithLabelValues(errorType).Inc()
	}
}

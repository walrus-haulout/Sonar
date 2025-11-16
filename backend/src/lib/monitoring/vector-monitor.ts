/**
 * Vector Database Monitoring and Alerting
 * Tracks Pinecone performance, query metrics, and triggers alerts
 */

import { logger } from '../logger';

interface QueryMetrics {
  query_id: string;
  timestamp: Date;
  query_type: 'semantic' | 'audio' | 'hybrid';
  latency_ms: number;
  result_count: number;
  threshold: number;
  success: boolean;
  error?: string;
}

interface PerformanceAlert {
  type: 'high_latency' | 'high_error_rate' | 'low_cache_hit' | 'index_sync_lag';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: Record<string, any>;
}

interface AlertThresholds {
  max_query_latency_ms: number;
  max_error_rate: number;
  min_cache_hit_rate: number;
  max_index_sync_lag_ms: number;
  alert_window_minutes: number;
}

export class VectorMonitor {
  private queryMetrics: QueryMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private thresholds: AlertThresholds = {
    max_query_latency_ms: 500,
    max_error_rate: 0.05, // 5%
    min_cache_hit_rate: 0.3, // 30%
    max_index_sync_lag_ms: 60000, // 1 minute
    alert_window_minutes: 5,
  };

  constructor() {
    // Don't start monitoring loop here - call start() explicitly after initialization
  }

  /**
   * Start the monitoring loop
   */
  start(): void {
    if (this.monitoringInterval) {
      logger.warn('Monitoring loop already started');
      return;
    }
    this.startMonitoringLoop();
  }

  /**
   * Stop the monitoring loop
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Monitoring loop stopped');
    }
  }

  recordQuery(metric: QueryMetrics): void {
    this.queryMetrics.push(metric);

    // Check for immediate issues
    if (metric.latency_ms > this.thresholds.max_query_latency_ms) {
      this.addAlert({
        type: 'high_latency',
        severity: 'warning',
        message: `Query latency ${metric.latency_ms}ms exceeds threshold ${this.thresholds.max_query_latency_ms}ms`,
        timestamp: metric.timestamp,
        metrics: { latency_ms: metric.latency_ms, query_type: metric.query_type },
      });
    }

    if (!metric.success) {
      this.addAlert({
        type: 'high_error_rate',
        severity: 'warning',
        message: `Query failed: ${metric.error}`,
        timestamp: metric.timestamp,
        metrics: { query_type: metric.query_type },
      });
    }

    // Keep only recent metrics
    const cutoffTime = new Date(Date.now() - this.thresholds.alert_window_minutes * 60 * 1000);
    this.queryMetrics = this.queryMetrics.filter((m) => m.timestamp > cutoffTime);
  }

  private addAlert(alert: PerformanceAlert): void {
    this.alerts.push(alert);
    logger.warn({ alert }, `Vector DB Alert: ${alert.type}`);

    // Keep only recent alerts
    const cutoffTime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour
    this.alerts = this.alerts.filter((a) => a.timestamp > cutoffTime);
  }

  private startMonitoringLoop(): void {
    // Run every minute
    this.monitoringInterval = setInterval(() => {
      this.evaluateMetrics();
    }, 60 * 1000);
    logger.info('Monitoring loop started');
  }

  private evaluateMetrics(): void {
    if (this.queryMetrics.length === 0) {
      return;
    }

    // Calculate error rate
    const failed = this.queryMetrics.filter((m) => !m.success).length;
    const errorRate = failed / this.queryMetrics.length;

    if (errorRate > this.thresholds.max_error_rate) {
      this.addAlert({
        type: 'high_error_rate',
        severity: 'critical',
        message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${this.thresholds.max_error_rate * 100}%`,
        timestamp: new Date(),
        metrics: { error_rate: errorRate, failed, total: this.queryMetrics.length },
      });
    }

    // Calculate average latency
    const avgLatency =
      this.queryMetrics.reduce((sum, m) => sum + m.latency_ms, 0) /
      this.queryMetrics.length;

    if (avgLatency > this.thresholds.max_query_latency_ms) {
      this.addAlert({
        type: 'high_latency',
        severity: 'warning',
        message: `Average latency ${avgLatency.toFixed(0)}ms exceeds threshold`,
        timestamp: new Date(),
        metrics: { avg_latency: avgLatency },
      });
    }
  }

  getMetrics(): {
    total_queries: number;
    success_rate: number;
    avg_latency_ms: number;
    recent_alerts: number;
  } {
    if (this.queryMetrics.length === 0) {
      return {
        total_queries: 0,
        success_rate: 100,
        avg_latency_ms: 0,
        recent_alerts: this.alerts.length,
      };
    }

    const successful = this.queryMetrics.filter((m) => m.success).length;
    const avgLatency =
      this.queryMetrics.reduce((sum, m) => sum + m.latency_ms, 0) /
      this.queryMetrics.length;

    return {
      total_queries: this.queryMetrics.length,
      success_rate: (successful / this.queryMetrics.length) * 100,
      avg_latency_ms: avgLatency,
      recent_alerts: this.alerts.length,
    };
  }

  getAlerts(): PerformanceAlert[] {
    return this.alerts;
  }

  setThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    logger.info('Updated monitoring thresholds', { thresholds: this.thresholds });
  }

  clearAlerts(): void {
    this.alerts = [];
  }
}

export const vectorMonitor = new VectorMonitor();

export interface QueueMetrics {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface QueueHealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  queues?: Record<string, QueueMetrics>;
  message?: string;
}

# CloudWatch Metric Filters
# Requirements: 14.7

#------------------------------------------------------------------------------
# Custom Application Metric Filters
# Requirements: 14.7
#------------------------------------------------------------------------------

# Metric filter for trade execution events
resource "aws_cloudwatch_log_metric_filter" "trade_executions" {
  count = contains(keys(var.lambda_function_names), "exchange-orders") ? 1 : 0

  name           = "${local.name_prefix}-trade-executions"
  pattern        = "[timestamp, requestId, level=INFO, message=\"Trade executed*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["exchange-orders"].name

  metric_transformation {
    name          = "TradeExecutions"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for trade execution errors
resource "aws_cloudwatch_log_metric_filter" "trade_execution_errors" {
  count = contains(keys(var.lambda_function_names), "exchange-orders") ? 1 : 0

  name           = "${local.name_prefix}-trade-execution-errors"
  pattern        = "[timestamp, requestId, level=ERROR, message=\"Trade execution failed*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["exchange-orders"].name

  metric_transformation {
    name          = "TradeExecutionErrors"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for risk events triggered
resource "aws_cloudwatch_log_metric_filter" "risk_events_triggered" {
  count = contains(keys(var.lambda_function_names), "risk-events") ? 1 : 0

  name           = "${local.name_prefix}-risk-events-triggered"
  pattern        = "[timestamp, requestId, level=WARN, message=\"Risk event triggered*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["risk-events"].name

  metric_transformation {
    name          = "RiskEventsTriggered"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for kill switch activations
resource "aws_cloudwatch_log_metric_filter" "kill_switch_activations" {
  count = contains(keys(var.lambda_function_names), "kill-switch") ? 1 : 0

  name           = "${local.name_prefix}-kill-switch-activations"
  pattern        = "[timestamp, requestId, level=*, message=\"Kill switch activated*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["kill-switch"].name

  metric_transformation {
    name          = "KillSwitchActivations"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for circuit breaker trips
resource "aws_cloudwatch_log_metric_filter" "circuit_breaker_trips" {
  count = contains(keys(var.lambda_function_names), "circuit-breakers") ? 1 : 0

  name           = "${local.name_prefix}-circuit-breaker-trips"
  pattern        = "[timestamp, requestId, level=*, message=\"Circuit breaker tripped*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["circuit-breakers"].name

  metric_transformation {
    name          = "CircuitBreakerTrips"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for AI analysis requests
resource "aws_cloudwatch_log_metric_filter" "ai_analysis_requests" {
  count = contains(keys(var.lambda_function_names), "analysis") ? 1 : 0

  name           = "${local.name_prefix}-ai-analysis-requests"
  pattern        = "[timestamp, requestId, level=INFO, message=\"AI analysis requested*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["analysis"].name

  metric_transformation {
    name          = "AIAnalysisRequests"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for position limit breaches
resource "aws_cloudwatch_log_metric_filter" "position_limit_breaches" {
  count = contains(keys(var.lambda_function_names), "position-limits") ? 1 : 0

  name           = "${local.name_prefix}-position-limit-breaches"
  pattern        = "[timestamp, requestId, level=WARN, message=\"Position limit breach*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["position-limits"].name

  metric_transformation {
    name          = "PositionLimitBreaches"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for drawdown alerts
resource "aws_cloudwatch_log_metric_filter" "drawdown_alerts" {
  count = contains(keys(var.lambda_function_names), "drawdown") ? 1 : 0

  name           = "${local.name_prefix}-drawdown-alerts"
  pattern        = "[timestamp, requestId, level=WARN, message=\"Drawdown threshold exceeded*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["drawdown"].name

  metric_transformation {
    name          = "DrawdownAlerts"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for audit events
resource "aws_cloudwatch_log_metric_filter" "audit_events" {
  count = contains(keys(var.lambda_function_names), "audit") ? 1 : 0

  name           = "${local.name_prefix}-audit-events"
  pattern        = "[timestamp, requestId, level=INFO, message=\"Audit event recorded*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["audit"].name

  metric_transformation {
    name          = "AuditEvents"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# Metric filter for exchange connection errors
resource "aws_cloudwatch_log_metric_filter" "exchange_connection_errors" {
  count = contains(keys(var.lambda_function_names), "exchange-connections") ? 1 : 0

  name           = "${local.name_prefix}-exchange-connection-errors"
  pattern        = "[timestamp, requestId, level=ERROR, message=\"Exchange connection failed*\"]"
  log_group_name = aws_cloudwatch_log_group.lambda["exchange-connections"].name

  metric_transformation {
    name          = "ExchangeConnectionErrors"
    namespace     = "${var.project_name}/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

# CloudWatch Alarms
# Requirements: 14.2, 14.3, 14.4, 14.5, 14.8

#------------------------------------------------------------------------------
# Lambda Error Rate Alarms
# Requirements: 14.2, 14.8
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.lambda_function_names

  alarm_name          = "${local.name_prefix}-${each.key}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.lambda_error_evaluation_periods
  threshold           = var.lambda_error_threshold_percent
  alarm_description   = "Lambda function ${each.key} error rate exceeds ${var.lambda_error_threshold_percent}%"
  treat_missing_data  = "notBreaching"

  # Use metric math to calculate error rate percentage
  metric_query {
    id          = "error_rate"
    expression  = "100 * errors / invocations"
    label       = "Error Rate"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = var.alarm_period_seconds
      stat        = "Sum"
      dimensions = {
        FunctionName = "${local.name_prefix}-${each.key}"
      }
    }
  }

  metric_query {
    id = "invocations"
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = var.alarm_period_seconds
      stat        = "Sum"
      dimensions = {
        FunctionName = "${local.name_prefix}-${each.key}"
      }
    }
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn,
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-${each.key}-errors-alarm"
    Function = each.key
    Type     = "lambda-error"
  })
}

#------------------------------------------------------------------------------
# API Gateway 5xx Error Rate Alarm
# Requirements: 14.3, 14.8
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_errors" {
  count = var.api_gateway_name != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-api-gateway-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.api_gateway_error_evaluation_periods
  threshold           = var.api_gateway_5xx_threshold_percent
  alarm_description   = "API Gateway 5xx error rate exceeds ${var.api_gateway_5xx_threshold_percent}%"
  treat_missing_data  = "notBreaching"

  # Use metric math to calculate error rate percentage
  metric_query {
    id          = "error_rate"
    expression  = "100 * errors / requests"
    label       = "5xx Error Rate"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "5XXError"
      namespace   = "AWS/ApiGateway"
      period      = var.alarm_period_seconds
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }

  metric_query {
    id = "requests"
    metric {
      metric_name = "Count"
      namespace   = "AWS/ApiGateway"
      period      = var.alarm_period_seconds
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn,
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api-gateway-5xx-errors-alarm"
    Type = "api-gateway-error"
  })
}

#------------------------------------------------------------------------------
# DynamoDB Throttling Alarms
# Requirements: 14.4, 14.8
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "dynamodb_read_throttling" {
  for_each = toset(var.dynamodb_table_names)

  alarm_name          = "${local.name_prefix}-dynamodb-${each.key}-read-throttling"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.dynamodb_throttle_evaluation_periods
  metric_name         = "ReadThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = var.alarm_period_seconds
  statistic           = "Sum"
  threshold           = var.dynamodb_throttle_threshold
  alarm_description   = "DynamoDB table ${each.key} read throttling exceeds ${var.dynamodb_throttle_threshold} requests"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = each.key
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn,
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-dynamodb-${each.key}-read-throttling-alarm"
    TableName = each.key
    Type      = "dynamodb-throttling"
  })
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_write_throttling" {
  for_each = toset(var.dynamodb_table_names)

  alarm_name          = "${local.name_prefix}-dynamodb-${each.key}-write-throttling"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.dynamodb_throttle_evaluation_periods
  metric_name         = "WriteThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = var.alarm_period_seconds
  statistic           = "Sum"
  threshold           = var.dynamodb_throttle_threshold
  alarm_description   = "DynamoDB table ${each.key} write throttling exceeds ${var.dynamodb_throttle_threshold} requests"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = each.key
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn,
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name      = "${local.name_prefix}-dynamodb-${each.key}-write-throttling-alarm"
    TableName = each.key
    Type      = "dynamodb-throttling"
  })
}

#------------------------------------------------------------------------------
# Redis Memory Utilization Alarm
# Requirements: 14.5, 14.8
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "redis_memory_utilization" {
  count = var.redis_cluster_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-memory-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.redis_memory_evaluation_periods
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = var.alarm_period_seconds
  statistic           = "Average"
  threshold           = var.redis_memory_threshold_percent
  alarm_description   = "Redis memory utilization exceeds ${var.redis_memory_threshold_percent}%"
  treat_missing_data  = "breaching"

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn,
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-memory-utilization-alarm"
    Type = "redis-memory"
  })
}

#------------------------------------------------------------------------------
# Redis CPU Utilization Alarm (Additional)
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "redis_cpu_utilization" {
  count = var.redis_cluster_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-redis-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.redis_cpu_evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = var.alarm_period_seconds
  statistic           = "Average"
  threshold           = var.redis_cpu_threshold_percent
  alarm_description   = "Redis CPU utilization exceeds ${var.redis_cpu_threshold_percent}%"
  treat_missing_data  = "notBreaching"

  dimensions = {
    CacheClusterId = var.redis_cluster_id
  }

  # Alarm actions - notify SNS topics
  alarm_actions = compact([
    var.system_health_sns_topic_arn
  ])

  ok_actions = compact([
    var.system_health_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-cpu-utilization-alarm"
    Type = "redis-cpu"
  })
}

#------------------------------------------------------------------------------
# Critical Function Alarms (Kill Switch, Circuit Breakers)
# Requirements: 14.2, 14.8
#------------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "kill_switch_errors" {
  count = contains(keys(var.lambda_function_names), "kill-switch") ? 1 : 0

  alarm_name          = "${local.name_prefix}-kill-switch-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Kill switch Lambda function has errors - CRITICAL"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${local.name_prefix}-kill-switch"
  }

  # Alarm actions - notify critical alerts immediately
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn
  ])

  ok_actions = compact([
    var.critical_alerts_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-kill-switch-errors-alarm"
    Type     = "critical-function"
    Severity = "critical"
  })
}

resource "aws_cloudwatch_metric_alarm" "circuit_breakers_errors" {
  count = contains(keys(var.lambda_function_names), "circuit-breakers") ? 1 : 0

  alarm_name          = "${local.name_prefix}-circuit-breakers-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Circuit breakers Lambda function has errors - CRITICAL"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = "${local.name_prefix}-circuit-breakers"
  }

  # Alarm actions - notify critical alerts immediately
  alarm_actions = compact([
    var.critical_alerts_sns_topic_arn
  ])

  ok_actions = compact([
    var.critical_alerts_sns_topic_arn
  ])

  tags = merge(local.common_tags, {
    Name     = "${local.name_prefix}-circuit-breakers-errors-alarm"
    Type     = "critical-function"
    Severity = "critical"
  })
}

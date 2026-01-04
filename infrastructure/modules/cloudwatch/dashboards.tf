# CloudWatch Dashboards
# Requirements: 14.1

#------------------------------------------------------------------------------
# API Performance Dashboard
# Requirements: 14.1
#------------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "api_performance" {
  dashboard_name = "${local.name_prefix}-api-performance"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway Request Count"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApiGateway", "Count", "ApiName", var.api_gateway_name, { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway Latency"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApiGateway", "Latency", "ApiName", var.api_gateway_name, { stat = "Average", period = 60 }],
            ["AWS/ApiGateway", "Latency", "ApiName", var.api_gateway_name, { stat = "p99", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway 4xx Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApiGateway", "4XXError", "ApiName", var.api_gateway_name, { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "API Gateway 5xx Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApiGateway", "5XXError", "ApiName", var.api_gateway_name, { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 24
        height = 6
        properties = {
          title  = "API Gateway Integration Latency"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/ApiGateway", "IntegrationLatency", "ApiName", var.api_gateway_name, { stat = "Average", period = 60 }],
            ["AWS/ApiGateway", "IntegrationLatency", "ApiName", var.api_gateway_name, { stat = "p99", period = 60 }]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Lambda Metrics Dashboard
# Requirements: 14.1
#------------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "lambda_metrics" {
  dashboard_name = "${local.name_prefix}-lambda-metrics"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Invocations"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              "AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-${func_name}",
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Errors"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              "AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-${func_name}",
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Duration"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              "AWS/Lambda", "Duration", "FunctionName", "${local.name_prefix}-${func_name}",
              { stat = "Average", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Throttles"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              "AWS/Lambda", "Throttles", "FunctionName", "${local.name_prefix}-${func_name}",
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Concurrent Executions"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              "AWS/Lambda", "ConcurrentExecutions", "FunctionName", "${local.name_prefix}-${func_name}",
              { stat = "Maximum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Error Rate (%)"
          region = data.aws_region.current.name
          metrics = [
            for func_name in keys(var.lambda_function_names) : [
              {
                expression = "100 * errors_${replace(func_name, "-", "_")} / invocations_${replace(func_name, "-", "_")}"
                label      = func_name
                id         = "error_rate_${replace(func_name, "-", "_")}"
              }
            ]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# DynamoDB Metrics Dashboard
# Requirements: 14.1
#------------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "dynamodb_metrics" {
  dashboard_name = "${local.name_prefix}-dynamodb-metrics"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Read Capacity Units"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", table_name,
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Write Capacity Units"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", table_name,
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Read Throttled Requests"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "ReadThrottledRequests", "TableName", table_name,
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Write Throttled Requests"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "WriteThrottledRequests", "TableName", table_name,
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB Successful Request Latency"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", table_name, "Operation", "GetItem",
              { stat = "Average", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "DynamoDB System Errors"
          region = data.aws_region.current.name
          metrics = [
            for table_name in var.dynamodb_table_names : [
              "AWS/DynamoDB", "SystemErrors", "TableName", table_name,
              { stat = "Sum", period = 60 }
            ]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Trading Activity Dashboard
# Requirements: 14.1
#------------------------------------------------------------------------------
resource "aws_cloudwatch_dashboard" "trading_activity" {
  dashboard_name = "${local.name_prefix}-trading-activity"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Exchange Orders Lambda Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-exchange-orders", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "Exchange Orders Lambda Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-exchange-orders", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Risk Controls - Kill Switch Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-kill-switch", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Risk Controls - Circuit Breakers Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-circuit-breakers", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Position Limits Lambda Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-position-limits", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title  = "Drawdown Lambda Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-drawdown", { stat = "Sum", period = 60 }]
          ]
          view = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 24
        height = 6
        properties = {
          title  = "Trade Lifecycle Lambda Metrics"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "${local.name_prefix}-trade-lifecycle", { stat = "Sum", period = 60 }],
            ["AWS/Lambda", "Errors", "FunctionName", "${local.name_prefix}-trade-lifecycle", { stat = "Sum", period = 60 }],
            ["AWS/Lambda", "Duration", "FunctionName", "${local.name_prefix}-trade-lifecycle", { stat = "Average", period = 60 }]
          ]
          view = "timeSeries"
        }
      }
    ]
  })
}
